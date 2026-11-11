import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, CATS } from '../api.js'
import { fmt, IdeaCard, useApp, useIdeas, useLike } from '../components.jsx'

export function Exhibition() {
  const [ideas, reload] = useIdeas()
  const [sp] = useSearchParams()
  const [cat, setCat] = useState(CATS.includes(sp.get('cat')) ? sp.get('cat') : 'Все')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('new')
  const shown = useMemo(() => {
    let r = (ideas || []).filter((i) => (cat === 'Все' || i.cat === cat) && (i.title + i.text).toLowerCase().includes(q.toLowerCase()))
    if (sort === 'likes') r = [...r].sort((a, b) => b.likes - a.likes)
    if (sort === 'open') r = r.filter((i) => !i.sequels.length)
    if (sort === 'done') r = r.filter((i) => i.sequels.length)
    return r
  }, [ideas, cat, q, sort])
  return (
    <div className="page">
      <h1 className="h">Экспозиция</h1>
      <div className="filters">
        <input placeholder="Поиск по идеям" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск" />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Сортировка">
          <option value="new">Сначала новые</option>
          <option value="likes">Самые жалеемые</option>
          <option value="open">Ждут хозяина</option>
          <option value="done">Нашли продолжение</option>
        </select>
      </div>
      <div className="chips">{['Все', ...CATS].map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}</div>
      {!ideas ? <p>Загружаю…</p> : <div className="grid">{shown.map((i) => <IdeaCard key={i.id} idea={i} reload={reload} />)}</div>}
      {ideas && !shown.length && <p>Ничего не найдено. Сбросьте фильтры или <Link to="/submit">сдайте свою идею</Link>.</p>}
    </div>
  )
}

export function IdeaPage() {
  const { id } = useParams()
  const { user, toast } = useApp()
  const nav = useNavigate()
  const [idea, setIdea] = useState(null)
  const [missing, setMissing] = useState(false)
  const [text, setText] = useState('')
  const [anon, setAnon] = useState(true)
  const reload = () => api.idea(id).then(setIdea).catch(() => setMissing(true))
  useEffect(() => { reload() }, [id, user]) // eslint-disable-line
  const like = useLike(idea || { id }, reload)
  const run = (fn, after) => async () => { try { await fn(); after ? after() : await reload() } catch (e) { toast(e.message) } }
  if (missing) return <div className="page"><h1 className="h">Эту идею не нашли</h1><p>Возможно, её удалили или скрыли.</p><Link className="btn" to="/exhibition">К экспозиции</Link></div>
  if (!idea) return <div className="page"><p>Загружаю…</p></div>
  const submit = async (e) => {
    e.preventDefault()
    try { await api.take(idea.id, { text, anon }); setText(''); await reload() } catch (er) { toast(er.message) }
  }
  const done = idea.sequels.length > 0
  return (
    <div className="page narrow">
      <Link to="/exhibition" className="back">← К экспозиции</Link>
      <article className={'card big ' + (done ? 'lit' : 'ghost')}>
        <span className="tag">{idea.cat}</span>
        <h1 className="h">{idea.title}</h1>
        <p className="body">{idea.text}</p>
        <div className="foot">
          <span>{idea.by || 'Аноним'}, {fmt(idea.at)}</span>
          <button className={'like' + (idea.liked ? ' on' : '')} onClick={like} aria-pressed={idea.liked}>♥ Жаль, что не сделано: {idea.likes}</button>
        </div>
      </article>
      <h2 className="h">Что из этого вышло</h2>
      {!done && <p>Пока никто не забрал эту идею. Станьте первым.</p>}
      {idea.sequels.map((s) => (
        <div className="sequel" key={s.id}>
          <p>{s.text}</p>
          <small>{s.by || 'Аноним'}, {fmt(s.at)}</small>
          {(s.mine || user?.admin) && <button className="link" onClick={run(() => api.delSequel(s.id))}>Удалить</button>}
        </div>
      ))}
      {user ? (
        <form className="form" onSubmit={submit}>
          <h3>Забрать идею и показать результат</h3>
          <textarea rows={4} maxLength={1500} placeholder="Что вы сделали или собираетесь сделать?" value={text} onChange={(e) => setText(e.target.value)} />
          <label className="check"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Не показывать моё имя</label>
          <button className="btn" disabled={text.trim().length < 10}>Показать результат</button>
        </form>
      ) : <p><Link to="/login" state={{ from: '/idea/' + idea.id }}>Войдите</Link>, чтобы забрать идею.</p>}
      <div className="manage">
        {(idea.mine || user?.admin)
          ? <button className="link" onClick={() => confirm('Удалить идею навсегда?') && run(() => api.del(idea.id), () => nav('/exhibition'))()}>Удалить идею</button>
          : user && <button className="link" onClick={() => confirm('Пожаловаться на эту идею?') && run(() => api.report(idea.id), () => toast('Спасибо, жалоба принята'))()}>Пожаловаться</button>}
      </div>
    </div>
  )
}

export function Submit() {
  const { user, toast } = useApp()
  const nav = useNavigate()
  const [f, setF] = useState({ title: '', text: '', cat: CATS[0], anon: true })
  const [busy, setBusy] = useState(false)
  if (!user) return <Navigate to="/login" state={{ from: '/submit' }} replace />
  const ok = f.title.trim() && f.text.trim().length >= 20
  const send = async (e) => {
    e.preventDefault(); setBusy(true)
    try { const { id } = await api.add(f); nav('/idea/' + id) } catch (er) { toast(er.message); setBusy(false) }
  }
  return (
    <div className="page narrow">
      <h1 className="h">Сдать идею на хранение</h1>
      <form className="form" onSubmit={send}>
        <label>Название<input value={f.title} maxLength={70} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label>Что это было и почему не вышло
          <textarea rows={7} maxLength={1500} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
        </label>
        <label>Раздел<select value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={f.anon} onChange={(e) => setF({ ...f, anon: e.target.checked })} /> Опубликовать анонимно</label>
        <button className="btn big" disabled={!ok || busy}>{busy ? 'Отправляю…' : 'Передать в музей'}</button>
      </form>
    </div>
  )
}
