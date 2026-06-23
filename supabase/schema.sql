-- ============================================================
--  吃饭人数统计 PWA — Supabase schema
--  在 Supabase 控制台 → SQL Editor 里整段粘贴执行即可。
--  设计原则：anon key 不能直接读写表，所有访问走 SECURITY DEFINER 函数，
--  保证成员端拿不到姓名名单；名单/统计/成员管理均需管理密码。
-- ============================================================

-- pgcrypto 提供 crypt()/gen_salt()。Supabase 把扩展装在 extensions schema。
create extension if not exists pgcrypto with schema extensions;

-- ---------- 表 ----------

create table if not exists groups (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null,
  name                text not null,
  admin_password_hash text not null,
  -- 报名窗口：距「供应日」当天 0 点的分钟数；start 可为负 = 前一天；null = 不限制
  lunch_start_min     int,
  lunch_end_min       int,
  dinner_start_min    int,
  dinner_end_min      int,
  timezone            text not null default 'Asia/Shanghai',
  created_at          timestamptz not null default now()
);

create table if not exists members (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references groups(id) on delete cascade,
  member_id     text not null,                 -- 客户端生成 uuid，存 localStorage
  name          text not null,
  status        text not null default 'active' check (status in ('active','blocked')),
  first_seen_at timestamptz not null default now(),
  unique (group_id, name),                     -- 名字占有，防同名冒充
  unique (group_id, member_id)                 -- 一设备一身份
);

create table if not exists check_ins (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  member_id   text not null,
  member_name text not null,                   -- 冗余存名字，方便导出
  date        date not null,                   -- 供应日（服务端按窗口判定）
  meal        text not null check (meal in ('lunch','dinner')),
  created_at  timestamptz not null default now(),
  unique (group_id, member_id, date, meal)
);
create index if not exists idx_checkins_group_date on check_ins (group_id, date);

-- 轻量「脉冲」表：仅用于 Realtime 推送「有变化」信号，不含任何姓名
create table if not exists group_pulse (
  group_id   uuid primary key references groups(id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- 全局配置：建群口令（哈希存储）。只有知道口令的人才能建群。
create table if not exists app_config (
  id                 int primary key default 1,
  create_secret_hash text not null,
  constraint app_config_single_row check (id = 1)
);
-- 初始化建群口令（仅首次写入；之后改口令见文件末尾说明）
insert into app_config(id, create_secret_hash)
  values (1, extensions.crypt('chifan2026', extensions.gen_salt('bf')))
  on conflict (id) do nothing;

-- ---------- RLS：默认全锁，只有 group_pulse 可读 ----------

alter table groups      enable row level security;
alter table members     enable row level security;
alter table check_ins   enable row level security;
alter table group_pulse enable row level security;
alter table app_config  enable row level security;

drop policy if exists pulse_read on group_pulse;
create policy pulse_read on group_pulse for select using (true);

-- ---------- Realtime ----------
-- 把 group_pulse 加入 Supabase Realtime 发布（若已存在会报错，可忽略）
do $$
begin
  alter publication supabase_realtime add table group_pulse;
exception when others then null;
end $$;

-- check_ins 变化时更新脉冲，触发成员端 Realtime 刷新
create or replace function bump_pulse() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into group_pulse(group_id, updated_at)
    values (coalesce(NEW.group_id, OLD.group_id), now())
  on conflict (group_id) do update set updated_at = excluded.updated_at;
  return null;
end $$;

drop trigger if exists trg_pulse on check_ins;
create trigger trg_pulse after insert or delete on check_ins
  for each row execute function bump_pulse();

-- ============================================================
--  窗口逻辑：按群时区，反推「当前开放的供应日」
-- ============================================================

-- 返回某餐窗口的状态：serving_date / status(open|closed|always) / opens_at / closes_at
create or replace function meal_window_state(p_tz text, p_start int, p_end int)
returns table(serving_date date, status text, opens_at timestamptz, closes_at timestamptz)
language plpgsql stable as $$
declare
  now_ts timestamptz := now();
  base   date := (now_ts at time zone p_tz)::date;
  cand   date;
  s_ts   timestamptz;
  e_ts   timestamptz;
  best_open timestamptz := null;
  best_date date := null;
begin
  if p_start is null or p_end is null then
    serving_date := base; status := 'always'; opens_at := null; closes_at := null;
    return next; return;
  end if;

  -- 是否此刻正开放（检查 昨天/今天/明天 三个候选供应日）
  foreach cand in array array[base - 1, base, base + 1] loop
    s_ts := (cand::timestamp + make_interval(mins => p_start)) at time zone p_tz;
    e_ts := (cand::timestamp + make_interval(mins => p_end))   at time zone p_tz;
    if now_ts >= s_ts and now_ts < e_ts then
      serving_date := cand; status := 'open'; opens_at := s_ts; closes_at := e_ts;
      return next; return;
    end if;
  end loop;

  -- 未开放：找最近的下一次开放
  foreach cand in array array[base, base + 1, base + 2] loop
    s_ts := (cand::timestamp + make_interval(mins => p_start)) at time zone p_tz;
    if s_ts > now_ts and (best_open is null or s_ts < best_open) then
      best_open := s_ts; best_date := cand;
    end if;
  end loop;
  serving_date := best_date; status := 'closed'; opens_at := best_open;
  closes_at := (best_date::timestamp + make_interval(mins => p_end)) at time zone p_tz;
  return next;
end $$;

-- ============================================================
--  成员侧 RPC
-- ============================================================

-- 建群（需建群口令）
drop function if exists create_group(text, text);
create or replace function create_group(p_name text, p_password text, p_secret text)
returns jsonb security definer set search_path = public, extensions language plpgsql as $$
declare new_code text; tries int := 0; secret_ok boolean;
begin
  if btrim(coalesce(p_name,'')) = '' or btrim(coalesce(p_password,'')) = '' then
    return jsonb_build_object('error','missing');
  end if;
  select exists(
    select 1 from app_config
    where id = 1 and create_secret_hash = crypt(coalesce(p_secret,''), create_secret_hash)
  ) into secret_ok;
  if not secret_ok then return jsonb_build_object('error','bad_secret'); end if;
  loop
    new_code := lower(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists(select 1 from groups where code = new_code);
    tries := tries + 1;
    if tries > 10 then return jsonb_build_object('error','code_gen'); end if;
  end loop;
  insert into groups(code, name, admin_password_hash)
    values (new_code, btrim(p_name), crypt(p_password, gen_salt('bf')));
  return jsonb_build_object('ok', true, 'code', new_code);
end $$;

-- 入群 / 改名（名字占有校验）
create or replace function join_group(p_code text, p_member_id text, p_name text)
returns jsonb security definer set search_path = public, extensions language plpgsql as $$
declare g groups; existing members; cleaned text;
begin
  cleaned := btrim(coalesce(p_name,''));
  if cleaned = '' then return jsonb_build_object('error','empty_name'); end if;
  select * into g from groups where code = p_code;
  if not found then return jsonb_build_object('error','group_not_found'); end if;

  select * into existing from members where group_id = g.id and member_id = p_member_id;
  if found then
    if existing.name <> cleaned then
      if exists(select 1 from members where group_id = g.id and name = cleaned and member_id <> p_member_id) then
        return jsonb_build_object('error','name_taken');
      end if;
      update members  set name = cleaned where group_id = g.id and member_id = p_member_id;
      update check_ins set member_name = cleaned where group_id = g.id and member_id = p_member_id;
    end if;
    return jsonb_build_object('ok', true, 'name', cleaned, 'blocked', existing.status = 'blocked');
  end if;

  if exists(select 1 from members where group_id = g.id and name = cleaned) then
    return jsonb_build_object('error','name_taken');
  end if;
  insert into members(group_id, member_id, name) values (g.id, p_member_id, cleaned);
  return jsonb_build_object('ok', true, 'name', cleaned, 'blocked', false);
end $$;

-- 成员页状态：两餐的供应日/窗口状态/人数/我报了没（不含他人姓名）
create or replace function get_member_state(p_code text, p_member_id text)
returns jsonb security definer set search_path = public, extensions language plpgsql stable as $$
declare
  g groups; meals text[] := array['lunch','dinner']; v_meal text;
  ws record; cnt int; mine boolean; st text; smin int; emin int;
  out jsonb := '{}'::jsonb;
begin
  select * into g from groups where code = p_code;
  if not found then return jsonb_build_object('error','group_not_found'); end if;

  select status into st from members where group_id = g.id and member_id = p_member_id;

  foreach v_meal in array meals loop
    if v_meal = 'lunch' then smin := g.lunch_start_min; emin := g.lunch_end_min;
    else smin := g.dinner_start_min; emin := g.dinner_end_min; end if;

    select * into ws from meal_window_state(g.timezone, smin, emin);

    select count(*) into cnt
      from check_ins c join members m on m.group_id = c.group_id and m.member_id = c.member_id
      where c.group_id = g.id and c.date = ws.serving_date and c.meal = v_meal and m.status = 'active';

    select exists(select 1 from check_ins
      where group_id = g.id and member_id = p_member_id and date = ws.serving_date and meal = v_meal)
      into mine;

    out := out || jsonb_build_object(v_meal, jsonb_build_object(
      'serving_date', ws.serving_date, 'status', ws.status,
      'opens_at', ws.opens_at, 'closes_at', ws.closes_at,
      'count', cnt, 'mine', mine));
  end loop;

  return jsonb_build_object(
    'group', jsonb_build_object('name', g.name, 'id', g.id),
    'blocked', coalesce(st = 'blocked', false),
    'meals', out);
end $$;

-- 报名 / 取消（服务端校验拉黑 + 窗口）
create or replace function toggle_checkin(p_code text, p_member_id text, p_meal text)
returns jsonb security definer set search_path = public, extensions language plpgsql as $$
declare g groups; m members; ws record; smin int; emin int; has boolean; cnt int;
begin
  if p_meal not in ('lunch','dinner') then return jsonb_build_object('error','bad_meal'); end if;
  select * into g from groups where code = p_code;
  if not found then return jsonb_build_object('error','group_not_found'); end if;
  select * into m from members where group_id = g.id and member_id = p_member_id;
  if not found then return jsonb_build_object('error','not_joined'); end if;
  if m.status = 'blocked' then return jsonb_build_object('error','blocked'); end if;

  if p_meal = 'lunch' then smin := g.lunch_start_min; emin := g.lunch_end_min;
  else smin := g.dinner_start_min; emin := g.dinner_end_min; end if;
  select * into ws from meal_window_state(g.timezone, smin, emin);
  if ws.status not in ('open','always') then
    return jsonb_build_object('error','closed', 'opens_at', ws.opens_at);
  end if;

  select exists(select 1 from check_ins
    where group_id = g.id and member_id = p_member_id and date = ws.serving_date and meal = p_meal)
    into has;

  if has then
    delete from check_ins where group_id = g.id and member_id = p_member_id and date = ws.serving_date and meal = p_meal;
  else
    insert into check_ins(group_id, member_id, member_name, date, meal)
      values (g.id, p_member_id, m.name, ws.serving_date, p_meal)
      on conflict do nothing;
  end if;

  select count(*) into cnt
    from check_ins c join members mm on mm.group_id = c.group_id and mm.member_id = c.member_id
    where c.group_id = g.id and c.date = ws.serving_date and c.meal = p_meal and mm.status = 'active';

  return jsonb_build_object('mine', not has, 'count', cnt, 'serving_date', ws.serving_date);
end $$;

-- ============================================================
--  管理侧 RPC（均需管理密码）
-- ============================================================

create or replace function verify_group_admin(p_code text, p_password text)
returns boolean security definer set search_path = public, extensions language sql stable as $$
  select exists(
    select 1 from groups
    where code = p_code and admin_password_hash = crypt(p_password, admin_password_hash));
$$;

-- 管理配置（窗口、时区、code、名称）
create or replace function get_admin_config(p_code text, p_password text)
returns jsonb security definer set search_path = public, extensions language plpgsql stable as $$
declare g groups;
begin
  if not verify_group_admin(p_code, p_password) then return jsonb_build_object('error','unauthorized'); end if;
  select * into g from groups where code = p_code;
  return jsonb_build_object('name', g.name, 'code', g.code, 'timezone', g.timezone,
    'lunch_start_min', g.lunch_start_min, 'lunch_end_min', g.lunch_end_min,
    'dinner_start_min', g.dinner_start_min, 'dinner_end_min', g.dinner_end_min);
end $$;

-- 某供应日的两餐名单
create or replace function get_admin_day(p_code text, p_password text, p_date date)
returns jsonb security definer set search_path = public, extensions language plpgsql stable as $$
declare g groups;
begin
  if not verify_group_admin(p_code, p_password) then return jsonb_build_object('error','unauthorized'); end if;
  select * into g from groups where code = p_code;
  return jsonb_build_object('date', p_date,
    'lunch', (select coalesce(jsonb_agg(c.member_name order by c.created_at), '[]'::jsonb)
              from check_ins c join members m on m.group_id = c.group_id and m.member_id = c.member_id
              where c.group_id = g.id and c.date = p_date and c.meal = 'lunch' and m.status = 'active'),
    'dinner', (select coalesce(jsonb_agg(c.member_name order by c.created_at), '[]'::jsonb)
              from check_ins c join members m on m.group_id = c.group_id and m.member_id = c.member_id
              where c.group_id = g.id and c.date = p_date and c.meal = 'dinner' and m.status = 'active'));
end $$;

-- 设置报名窗口
create or replace function set_windows(p_code text, p_password text,
  ls int, le int, ds int, de int)
returns jsonb security definer set search_path = public, extensions language plpgsql as $$
begin
  if not verify_group_admin(p_code, p_password) then return jsonb_build_object('error','unauthorized'); end if;
  update groups set lunch_start_min = ls, lunch_end_min = le,
    dinner_start_min = ds, dinner_end_min = de where code = p_code;
  return jsonb_build_object('ok', true);
end $$;

-- 成员列表（含「今日新成员」标记）
create or replace function list_members(p_code text, p_password text)
returns jsonb security definer set search_path = public, extensions language plpgsql stable as $$
declare g groups;
begin
  if not verify_group_admin(p_code, p_password) then return jsonb_build_object('error','unauthorized'); end if;
  select * into g from groups where code = p_code;
  return jsonb_build_object('members', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'member_id', member_id, 'name', name, 'status', status,
        'first_seen_at', first_seen_at,
        'is_new_today', (first_seen_at at time zone g.timezone)::date = (now() at time zone g.timezone)::date
      ) order by first_seen_at desc), '[]'::jsonb)
    from members where group_id = g.id));
end $$;

-- 拉黑 / 恢复
create or replace function set_member_status(p_code text, p_password text, p_member_id text, p_status text)
returns jsonb security definer set search_path = public, extensions language plpgsql as $$
declare g groups;
begin
  if not verify_group_admin(p_code, p_password) then return jsonb_build_object('error','unauthorized'); end if;
  if p_status not in ('active','blocked') then return jsonb_build_object('error','bad_status'); end if;
  select * into g from groups where code = p_code;
  update members set status = p_status where group_id = g.id and member_id = p_member_id;
  return jsonb_build_object('ok', true);
end $$;

-- 重置群码（旧链接失效）
create or replace function reset_group_code(p_code text, p_password text)
returns jsonb security definer set search_path = public, extensions language plpgsql as $$
declare new_code text; tries int := 0;
begin
  if not verify_group_admin(p_code, p_password) then return jsonb_build_object('error','unauthorized'); end if;
  loop
    new_code := lower(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists(select 1 from groups where code = new_code);
    tries := tries + 1;
    if tries > 10 then return jsonb_build_object('error','code_gen'); end if;
  end loop;
  update groups set code = new_code where code = p_code;
  return jsonb_build_object('ok', true, 'code', new_code);
end $$;

-- ============================================================
--  建群口令：默认 'chifan2026'。要改成你自己的口令，单独跑这一行：
--    update app_config set create_secret_hash = extensions.crypt('你的新口令', extensions.gen_salt('bf')) where id = 1;
-- ============================================================
