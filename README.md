# 吃饭统计 PWA

团队午饭 / 晚饭报名人数统计。成员免登录、扫码即报名；食堂凭管理密码看名单与统计。

- **技术栈**：React + Vite + vite-plugin-pwa（可添加到主屏幕、离线打开）+ Supabase（Postgres + Realtime）+ GitHub Pages
- **特点**：实名报名只显示人数（名单仅管理员可见）、报名时间窗口（支持跨夜）、多群组、防链接泄露（名字占有 / 拉黑 / 重置链接）

## 一、配置 Supabase（只需一次）

1. 打开你的 Supabase 项目 → 左侧 **SQL Editor** → New query。
2. 把 [`supabase/schema.sql`](supabase/schema.sql) 整个文件粘贴进去，点 **Run**。
3. 完成后进 **Database → Replication / Realtime**，确认 `group_pulse` 表已在 Realtime 发布中（SQL 已自动加入，正常无需手动操作）。

## 二、本地运行

```bash
npm install
# 把 .env 里的 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 填好（anon public key）
npm run dev
```

打开 http://localhost:5173

- `#/` 首页：新建群 / 进入已加入的群
- `#/g/<群码>` 成员报名页
- `#/g/<群码>/admin` 食堂统计页（输管理密码）

## 三、使用流程

1. 建群 → 设群名 + 管理密码 → 得到专属链接 + 二维码。
2. 进 **食堂统计页 → 设置**，配置午饭 / 晚饭的报名时间窗口（如午饭 前一天 21:00 → 当天 09:00）。
3. 把链接 / 二维码发到微信群，成员点开填一次名字即可报名当餐。
4. 食堂在统计页看人数、名单、按日期查历史、导出 CSV；在成员页可拉黑可疑成员、必要时重置链接。

## 四、部署到 GitHub Pages

1. 新建 GitHub 仓库并推送本项目。
2. 仓库 **Settings → Secrets and variables → Actions** 添加两个 secret：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
4. 推送到 `main` 即自动构建部署（见 `.github/workflows/deploy.yml`）。
   构建时 `base` 自动设为 `/<仓库名>/`，路由用 Hash 模式，刷新不会 404。

## 安全说明

- anon key 是公开可暴露的，仅用于前端。所有读写经 Postgres `SECURITY DEFINER` 函数，
  数据表对 anon 关闭直接读写——成员端**拿不到他人姓名**，名单 / 统计 / 成员管理全部需要管理密码。
- 管理密码以 bcrypt（`pgcrypto crypt()`）存哈希，不下发前端。
