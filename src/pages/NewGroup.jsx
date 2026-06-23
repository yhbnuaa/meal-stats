import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { createGroup } from '../lib/api'
import { rememberGroup } from '../lib/identity'

export default function NewGroup() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [pw, setPw] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [created, setCreated] = useState(null) // { code }
  const canvasRef = useRef(null)

  const link = created ? `${location.origin}${location.pathname}#/g/${created.code}` : ''

  useEffect(() => {
    if (created && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, link, { width: 180, margin: 1 })
    }
  }, [created, link])

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (!name.trim() || !pw.trim()) { setErr('群名和管理密码都要填'); return }
    if (!secret.trim()) { setErr('请填写建群口令'); return }
    setBusy(true)
    try {
      const res = await createGroup(name.trim(), pw.trim(), secret.trim())
      rememberGroup(res.code, name.trim())
      setCreated({ code: res.code })
    } catch (e) {
      if (e.code === 'bad_secret') setErr('建群口令不对，请向管理员索取')
      else setErr('创建失败：' + e.message)
    } finally {
      setBusy(false)
    }
  }

  function copy() {
    navigator.clipboard?.writeText(link)
  }

  if (created) {
    return (
      <div className="page">
        <div className="topbar"><h1>建群成功</h1></div>
        <div className="card center">
          <div className="muted small">把链接或二维码发到微信群，点开即可报名</div>
          <canvas ref={canvasRef} className="qr" />
          <div className="link-row">{link}</div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn-ghost btn-block" onClick={copy}>复制链接</button>
            <button className="btn-primary" onClick={() => nav(`/g/${created.code}`)}>进入</button>
          </div>
        </div>
        <div className="card">
          <div className="small muted">群码：<b>{created.code}</b>　管理密码就是你刚才设的那个。</div>
          <button className="btn-ghost btn-block" style={{ marginTop: 10 }}
            onClick={() => nav(`/g/${created.code}/admin`)}>去食堂统计页设置报名时间</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topbar"><h1>新建群</h1></div>
      <form className="card" onSubmit={submit}>
        <label className="field">
          <span>群名 / 团队名</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：研发二组" />
        </label>
        <label className="field">
          <span>管理密码（食堂查看统计用）</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="设一个密码" />
        </label>
        <label className="field">
          <span>建群口令（向管理员索取）</span>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="只有知道口令才能建群" />
        </label>
        {err && <p className="error-text">{err}</p>}
        <button className="btn-primary" disabled={busy}>{busy ? '创建中…' : '创建'}</button>
      </form>
      <button className="btn-ghost btn-block" onClick={() => nav('/')}>返回</button>
    </div>
  )
}
