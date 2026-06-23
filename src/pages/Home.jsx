import { useNavigate, Link } from 'react-router-dom'
import { useState } from 'react'
import { getMyGroups } from '../lib/identity'

export default function Home() {
  const nav = useNavigate()
  const [groups] = useState(getMyGroups())
  const [code, setCode] = useState('')

  function go(e) {
    e.preventDefault()
    const c = code.trim().toLowerCase()
    if (c) nav(`/g/${c}`)
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <h1>吃饭统计</h1>
          <div className="sub">午饭 / 晚饭报名人数</div>
        </div>
      </div>

      <div className="card">
        <button className="btn-primary" onClick={() => nav('/new')}>+ 新建一个群</button>
      </div>

      {groups.length > 0 && (
        <>
          <div className="section-title">我加入的群</div>
          <div className="card">
            {groups.map((g) => (
              <div className="list-item" key={g.code}>
                <Link to={`/g/${g.code}`} style={{ textDecoration: 'none', color: 'inherit', flex: 1 }}>
                  <div>{g.name || g.code}</div>
                  <div className="small muted">/{g.code}</div>
                </Link>
                <Link className="badge" to={`/g/${g.code}/admin`} style={{ textDecoration: 'none' }}>管理员</Link>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">用群码加入</div>
      <form className="card" onSubmit={go}>
        <div className="row">
          <input
            placeholder="输入 6 位群码"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button className="btn-ghost" type="submit">进入</button>
        </div>
      </form>
    </div>
  )
}
