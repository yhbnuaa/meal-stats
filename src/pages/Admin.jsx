import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  verifyAdmin, getAdminConfig, getAdminDay, setWindows,
  listMembers, setMemberStatus, resetGroupCode
} from '../lib/api'
import { splitMinutes, makeMinutes, describeMinutes, describeDate } from '../lib/windows'

const PW_KEY = (code) => `meal:adminpw:${code}`

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Admin() {
  const { code } = useParams()
  const nav = useNavigate()
  const [pw, setPw] = useState(sessionStorage.getItem(PW_KEY(code)) || '')
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(false)
  const [loginErr, setLoginErr] = useState('')

  // 验证已保存的密码
  useEffect(() => {
    if (pw && !authed) {
      verifyAdmin(code, pw).then((ok) => { if (ok) setAuthed(true) }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function login(e) {
    e.preventDefault()
    setLoginErr('')
    setChecking(true)
    try {
      const ok = await verifyAdmin(code, pw.trim())
      if (ok) {
        sessionStorage.setItem(PW_KEY(code), pw.trim())
        setAuthed(true)
      } else setLoginErr('密码不对')
    } catch (e) {
      setLoginErr(e.message)
    } finally {
      setChecking(false)
    }
  }

  if (!authed) {
    return (
      <div className="page">
        <div className="topbar"><h1>食堂登录</h1><div className="sub">群 /{code}</div></div>
        <form className="card" onSubmit={login}>
          <label className="field">
            <span>管理密码</span>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          </label>
          {loginErr && <p className="error-text">{loginErr}</p>}
          <button className="btn-primary" disabled={checking}>{checking ? '验证中…' : '进入'}</button>
        </form>
        <button className="btn-ghost btn-block" onClick={() => nav('/')}>返回</button>
      </div>
    )
  }

  return <AdminDashboard code={code} pw={pw} onLogout={() => { sessionStorage.removeItem(PW_KEY(code)); setAuthed(false) }} />
}

function AdminDashboard({ code, pw, onLogout }) {
  const [date, setDate] = useState(todayStr())
  const [day, setDay] = useState(null)
  const [tab, setTab] = useState('stats') // stats | members | settings

  const loadDay = useCallback(async () => {
    try { setDay(await getAdminDay(code, pw, date)) } catch (e) { console.error(e) }
  }, [code, pw, date])

  useEffect(() => { loadDay() }, [loadDay])

  const lunch = day?.lunch || []
  const dinner = day?.dinner || []

  function exportCsv() {
    const rows = [['餐次', '姓名']]
    lunch.forEach((n) => rows.push(['午饭', n]))
    dinner.forEach((n) => rows.push(['晚饭', n]))
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `就餐名单_${date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><h1>食堂统计</h1><div className="sub">群 /{code}</div></div>
        <button className="btn-ghost btn-sm" onClick={onLogout}>退出</button>
      </div>

      <div className="tabs">
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>统计</button>
        <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>成员</button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>设置</button>
      </div>

      {tab === 'stats' && (
        <>
          <div className="card">
            <label className="field" style={{ marginBottom: 0 }}>
              <span>供应日</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <div className="meal-grid" style={{ marginBottom: 14 }}>
            <div className="stat">
              <div className="stat-num">{lunch.length}</div>
              <div className="stat-label">午饭</div>
            </div>
            <div className="stat">
              <div className="stat-num">{dinner.length}</div>
              <div className="stat-label">晚饭</div>
            </div>
          </div>

          <Roster title={`午饭名单 · ${lunch.length} 人`} names={lunch} />
          <Roster title={`晚饭名单 · ${dinner.length} 人`} names={dinner} />

          <button className="btn-ghost btn-block" onClick={exportCsv}>导出 CSV 名单</button>
        </>
      )}

      {tab === 'members' && <MembersTab code={code} pw={pw} />}
      {tab === 'settings' && <SettingsTab code={code} pw={pw} />}
    </div>
  )
}

function Roster({ title, names }) {
  return (
    <div className="card">
      <div className="section-title" style={{ marginTop: 0 }}>{title}</div>
      {names.length === 0 ? (
        <div className="muted small">暂无</div>
      ) : (
        <div className="names">{names.map((n, i) => <span className="name-chip" key={i}>{n}</span>)}</div>
      )}
    </div>
  )
}

function MembersTab({ code, pw }) {
  const [members, setMembers] = useState([])
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try { const r = await listMembers(code, pw); setMembers(r.members || []) } catch (e) { console.error(e) }
  }, [code, pw])
  useEffect(() => { load() }, [load])

  async function toggleBlock(m) {
    setBusy(m.member_id)
    try {
      await setMemberStatus(code, pw, m.member_id, m.status === 'blocked' ? 'active' : 'blocked')
      await load()
    } finally { setBusy('') }
  }

  return (
    <div className="card">
      <div className="section-title" style={{ marginTop: 0 }}>全部成员 · {members.length} 人</div>
      {members.length === 0 && <div className="muted small">还没有人加入</div>}
      {members.map((m) => (
        <div className="list-item" key={m.member_id}>
          <div>
            <div>
              {m.name}{' '}
              {m.is_new_today && <span className="badge new">今日新加入</span>}{' '}
              {m.status === 'blocked' && <span className="badge blocked">已拉黑</span>}
            </div>
          </div>
          <button
            className={m.status === 'blocked' ? 'btn-ghost btn-sm' : 'btn-danger btn-sm'}
            disabled={busy === m.member_id}
            onClick={() => toggleBlock(m)}
          >
            {m.status === 'blocked' ? '恢复' : '拉黑'}
          </button>
        </div>
      ))}
    </div>
  )
}

// 把分钟数拆给 UI；null 时给个默认占位
function toEdit(min, fallbackDay, fallbackHH) {
  if (min == null) return { enabled: false, day: fallbackDay, time: `${String(fallbackHH).padStart(2, '0')}:00` }
  const p = splitMinutes(min)
  return { enabled: true, day: p.dayOffset, time: `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}` }
}
function fromEdit(startE, endE) {
  if (!startE.enabled || !endE.enabled) return [null, null]
  const [sh, sm] = startE.time.split(':').map(Number)
  const [eh, em] = endE.time.split(':').map(Number)
  return [makeMinutes(startE.day, sh, sm), makeMinutes(endE.day, eh, em)]
}

function SettingsTab({ code, pw }) {
  const [cfg, setCfg] = useState(null)
  const [msg, setMsg] = useState('')
  // 每餐的 start/end 编辑态
  const [ls, setLs] = useState(null), [le, setLe] = useState(null)
  const [ds, setDs] = useState(null), [de, setDe] = useState(null)
  const [enableLunch, setEnableLunch] = useState(true)
  const [enableDinner, setEnableDinner] = useState(true)

  useEffect(() => {
    getAdminConfig(code, pw).then((c) => {
      setCfg(c)
      setEnableLunch(c.lunch_start_min != null)
      setEnableDinner(c.dinner_start_min != null)
      setLs(toEdit(c.lunch_start_min, -1, 21))
      setLe(toEdit(c.lunch_end_min, 0, 9))
      setDs(toEdit(c.dinner_start_min, 0, 12))
      setDe(toEdit(c.dinner_end_min, 0, 15))
    }).catch(console.error)
  }, [code, pw])

  if (!cfg || !ls) return <div className="card muted">加载中…</div>

  async function save() {
    setMsg('')
    const [lsm, lem] = enableLunch ? fromEdit({ ...ls, enabled: true }, { ...le, enabled: true }) : [null, null]
    const [dsm, dem] = enableDinner ? fromEdit({ ...ds, enabled: true }, { ...de, enabled: true }) : [null, null]
    try {
      await setWindows(code, pw, lsm, lem, dsm, dem)
      setMsg('已保存')
      setTimeout(() => setMsg(''), 1800)
    } catch (e) { setMsg('保存失败：' + e.message) }
  }

  return (
    <>
      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>报名时间窗口（{cfg.timezone}）</div>
        <p className="small muted" style={{ marginTop: 0 }}>
          到点自动开放 / 截止；成员只能在窗口内报名当餐。支持跨夜，例如午饭「前一天 21:00 → 当天 09:00」。
        </p>

        <WindowEditor
          label="午饭"
          enabled={enableLunch} setEnabled={setEnableLunch}
          start={ls} setStart={setLs} end={le} setEnd={setLe}
        />
        <WindowEditor
          label="晚饭"
          enabled={enableDinner} setEnabled={setEnableDinner}
          start={ds} setStart={setDs} end={de} setEnd={setDe}
        />

        <button className="btn-primary" onClick={save}>保存窗口</button>
        {msg && <p className="small center" style={{ color: 'var(--green-dark)', marginBottom: 0 }}>{msg}</p>}
      </div>

      <ResetCard code={code} pw={pw} />
    </>
  )
}

function WindowEditor({ label, enabled, setEnabled, start, setStart, end, setEnd }) {
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginBottom: 12 }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <b>{label}</b>
        <label className="row" style={{ gap: 8 }}>
          <span className="small muted">限定时段</span>
          <span className="switch">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="track" />
            <span className="thumb" />
          </span>
        </label>
      </div>
      {enabled ? (
        <>
          <div className="window-edit">
            <span className="small muted">开始</span>
            <div className="triple">
              <select value={start.day} onChange={(e) => setStart({ ...start, day: Number(e.target.value) })}>
                <option value={-1}>前一天</option>
                <option value={0}>当天</option>
              </select>
              <input type="time" value={start.time} onChange={(e) => setStart({ ...start, time: e.target.value })} />
            </div>
          </div>
          <div className="window-edit">
            <span className="small muted">截止</span>
            <div className="triple">
              <select value={end.day} onChange={(e) => setEnd({ ...end, day: Number(e.target.value) })}>
                <option value={0}>当天</option>
                <option value={1}>次日</option>
              </select>
              <input type="time" value={end.time} onChange={(e) => setEnd({ ...end, time: e.target.value })} />
            </div>
          </div>
        </>
      ) : (
        <div className="small muted">不限时段，全天可报名</div>
      )}
    </div>
  )
}

function ResetCard({ code, pw }) {
  const nav = useNavigate()
  const [done, setDone] = useState('')
  async function reset() {
    if (!confirm('重置后旧链接立即失效，需要把新链接重新发给大家。确定？')) return
    try {
      const r = await resetGroupCode(code, pw)
      setDone(r.code)
    } catch (e) { alert('失败：' + e.message) }
  }
  if (done) {
    return (
      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>链接已重置</div>
        <p className="small">新群码：<b>{done}</b></p>
        <button className="btn-primary" onClick={() => nav(`/g/${done}/admin`)}>用新链接打开</button>
      </div>
    )
  }
  return (
    <div className="card">
      <div className="section-title" style={{ marginTop: 0 }}>怀疑链接泄露？</div>
      <button className="btn-danger btn-block" onClick={reset}>重置链接（旧链接失效）</button>
    </div>
  )
}
