import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getDeviceId, getName, setName, rememberGroup } from '../lib/identity'
import { joinGroup, getMemberState, toggleCheckin, ApiError } from '../lib/api'
import { usePulse } from '../hooks/usePulse'
import { hhmm, describeDate } from '../lib/windows'

const MEAL_LABEL = { lunch: '午饭', dinner: '晚饭' }

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)
const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
)
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
)
const MEAL_ICON = { lunch: SunIcon, dinner: MoonIcon }

export default function Member() {
  const { code } = useParams()
  const nav = useNavigate()
  const deviceId = getDeviceId()

  const [name, setLocalName] = useState(getName(code))
  const [nameInput, setNameInput] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinErr, setJoinErr] = useState('')

  const [state, setState] = useState(null) // get_member_state 返回
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState('')
  const [pending, setPending] = useState({})
  const toastTimer = useRef(null)

  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2200)
  }, [])

  const load = useCallback(async () => {
    if (!name) return
    try {
      const s = await getMemberState(code, deviceId)
      setState(s)
      setLoadErr('')
      if (s?.group?.name) rememberGroup(code, s.group.name)
    } catch (e) {
      setLoadErr(e.code === 'group_not_found' ? '群不存在或链接已失效' : e.message)
    }
  }, [code, deviceId, name])

  useEffect(() => { load() }, [load])
  usePulse(state?.group?.id, load)

  async function doJoin(e) {
    e.preventDefault()
    setJoinErr('')
    const n = nameInput.trim()
    if (!n) return
    setJoining(true)
    try {
      const res = await joinGroup(code, deviceId, n)
      setName(code, res.name)
      setLocalName(res.name)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'name_taken') setJoinErr('这个名字已被占用，换一个吧')
      else if (e instanceof ApiError && e.code === 'group_not_found') setJoinErr('群不存在或链接已失效')
      else setJoinErr(e.message)
    } finally {
      setJoining(false)
    }
  }

  async function onToggle(meal) {
    if (pending[meal]) return
    setPending((p) => ({ ...p, [meal]: true }))
    // 乐观更新
    setState((s) => {
      const m = s.meals[meal]
      const mine = !m.mine
      return { ...s, meals: { ...s.meals, [meal]: { ...m, mine, count: m.count + (mine ? 1 : -1) } } }
    })
    try {
      const res = await toggleCheckin(code, deviceId, meal)
      setState((s) => ({ ...s, meals: { ...s.meals, [meal]: { ...s.meals[meal], mine: res.mine, count: res.count } } }))
    } catch (e) {
      await load() // 回滚到真实状态
      if (e.code === 'closed') showToast('该餐报名已截止')
      else if (e.code === 'blocked') showToast('你已被移出该群，请联系食堂')
      else showToast('操作失败：' + e.message)
    } finally {
      setPending((p) => ({ ...p, [meal]: false }))
    }
  }

  // ---------- 未填昵称 ----------
  if (!name) {
    return (
      <div className="page">
        <div className="topbar"><h1>加入报名</h1></div>
        <form className="card" onSubmit={doJoin}>
          <label className="field">
            <span>请输入你的名字（食堂据此核对名单）</span>
            <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="如：张三" autoFocus />
          </label>
          {joinErr && <p className="error-text">{joinErr}</p>}
          <button className="btn-primary" disabled={joining}>{joining ? '加入中…' : '进入报名'}</button>
        </form>
      </div>
    )
  }

  // ---------- 已填昵称 ----------
  return (
    <div className="page">
      <div className="topbar">
        <div>
          <h1>{state?.group?.name || '报名'}</h1>
          <div className="sub">你好，{name}</div>
        </div>
        <Link className="badge" to={`/g/${code}/admin`} style={{ textDecoration: 'none' }}>管理员</Link>
      </div>

      {loadErr && <div className="card"><p className="error-text" style={{ margin: 0 }}>{loadErr}</p></div>}

      {state?.blocked && (
        <div className="card"><p className="error-text" style={{ margin: 0 }}>你已被移出该群，无法报名，请联系食堂。</p></div>
      )}

      {state && !state.blocked && (
        <div className="meal-grid">
          <MealCard meal="lunch" m={state.meals.lunch} pending={pending.lunch} onToggle={onToggle} />
          <MealCard meal="dinner" m={state.meals.dinner} pending={pending.dinner} onToggle={onToggle} />
        </div>
      )}

      {!state && !loadErr && <div className="card center muted">加载中…</div>}

      <p className="small muted center" style={{ marginTop: 16 }}>
        点一下报名，再点取消。
      </p>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function MealCard({ meal, m, pending, onToggle }) {
  const open = m.status === 'open' || m.status === 'always'
  const cls = `meal ${m.mine ? 'on' : ''} ${open ? '' : 'locked'}`
  const Icon = MEAL_ICON[meal]

  let statusText
  if (m.status === 'always') statusText = '随时可报名'
  else if (m.status === 'open') statusText = `截止 ${hhmm(m.closes_at)}`
  else statusText = `${hhmm(m.opens_at)} 开放`

  return (
    <div className={cls}>
      {m.mine && <div className="meal-check"><CheckIcon /></div>}
      <div className="meal-icon"><Icon /></div>
      <div className="meal-head">{MEAL_LABEL[meal]}</div>
      <div className="meal-date">{describeDate(m.serving_date)}</div>
      <div className="count">{m.count}<small>人</small></div>
      <div className="status muted">{statusText}</div>

      {open ? (
        <button
          className={`action ${m.mine ? 'cancel' : 'join'}`}
          disabled={pending}
          onClick={() => onToggle(meal)}
        >
          {m.mine ? '取消报名' : '我要吃'}
        </button>
      ) : (
        <button className="action disabled" disabled>
          {m.status === 'closed' ? '未开放' : '不可报名'}
        </button>
      )}
    </div>
  )
}
