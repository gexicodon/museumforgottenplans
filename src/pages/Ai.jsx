import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useApp } from '../components.jsx'

export function Halls() {
  const { user, toast } = useApp()
  const [halls, setHalls] = useState(null)
  const [ai, setAi] = useState(false)
  const [busy, setBusy] = useState(-1)
  useEffect(() => { api.halls().then(setHalls).catch((e) => toast(e.message)); api.config().then((c) => setAi(c.ai)) }, [toast])
  const name = async (g, idx) => {
    setBusy(idx)
    try { const r = await api.nameHall(g.ids); setHalls((hs) => hs.map((x, i) => (i === idx ? { ...x, ai: r } : x))) } catch (e) { toast(e.message) }
    setBusy(-1)
  }
  return (
    <div className="page narrow">
      <h1 className="h">Залы сходств</h1>
      <p className="lead sm">Музей группирует идеи, которые говорят об одном и том же.{ai ? ' Claude называет зал и предлагает, как слить идеи в один проект.' : ''}</p>
      {!halls ? <p>Загружаю…</p> : !halls.length && <p>Пока слишком мало похожих идей.</p>}
      {halls?.map((g, idx) => (
        <section className="card ghost hall" key={g.ids.join('-')}>
          <h3>{g.ai?.title || `Зал ${idx + 1}`}</h3>
          <ul>{g.ideas.map((i) => <li key={i.id}><Link to={'/idea/' + i.id}>{i.title}</Link></li>)}</ul>
          {g.ai && <p className="out">{g.ai.merge}</p>}
          {ai && !g.ai && (user
            ? <button className="btn sm" disabled={busy === idx} onClick={() => name(g, idx)}>{busy === idx ? 'Думаю…' : 'Назвать зал и объединить идеи'}</button>
            : <p><Link to="/login">Войдите</Link>, чтобы Claude назвал зал.</p>)}
        </section>
      ))}
    </div>
  )
}

export function Mix() {
  const { user, toast } = useApp()
  const nav = useNavigate()
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const spin = async () => {
    if (!user) return nav('/login', { state: { from: '/mix' } })
    setBusy(true); setState(null)
    try { const { a, b } = await api.pair(); setState({ a, b, res: await api.combine(a.id, b.id) }) } catch (e) { toast(e.message) }
    setBusy(false)
  }
  const save = async () => {
    const { a, res } = state
    try { const { id } = await api.add({ title: res.title.slice(0, 70), text: `${res.pitch} Первый шаг: ${res.first_step}`, cat: a.cat, anon: true }); nav('/idea/' + id) } catch (e) { toast(e.message) }
  }
  return (
    <div className="page narrow">
      <h1 className="h">Неожиданные сочетания</h1>
      <p className="lead sm">Музей берёт две идеи из разных разделов и ставит их рядом. Иногда из этого выходит новый проект.</p>
      <button className="btn big" onClick={spin} disabled={busy}>{busy ? 'Думаю…' : 'Столкнуть две идеи'}</button>
      {state && (
        <section className="card lit combo">
          <div className="pairs"><span>{state.a.title}</span><b>+</b><span>{state.b.title}</span></div>
          <h3>{state.res.title}</h3>
          <p>{state.res.pitch}</p>
          <p><b>Первый шаг:</b> {state.res.first_step}</p>
          <button className="btn alt sm" onClick={save}>Сдать сочетание как новую идею</button>
        </section>
      )}
    </div>
  )
}
