import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, CATS } from '../api.js'
import { fmt, Icon, IdeaCard, useApp, useIdeas, useLike } from '../components.jsx'
import { Reveal, useAnimatedGrid } from '../motion.jsx'

export function Exhibition() {
  const [ideas, reload, error] = useIdeas()
  const [sp, setSp] = useSearchParams()
  const cat = CATS.includes(sp.get('cat')) ? sp.get('cat') : 'Все'
  const setCat = (value) => setSp(value === 'Все' ? {} : { cat: value })
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('new')
  const shown = useMemo(() => {
    let r = (ideas || []).filter((i) => (cat === 'Все' || i.cat === cat) && (i.title + ' ' + i.text).toLocaleLowerCase('ru').includes(q.trim().toLocaleLowerCase('ru')))
    if (sort === 'likes') r = [...r].sort((a, b) => b.likes - a.likes)
    if (sort === 'open') r = r.filter((i) => !i.sequels.length)
    if (sort === 'done') r = r.filter((i) => i.sequels.length)
    return r
  }, [ideas, cat, q, sort])
  const [grid, captureGrid] = useAnimatedGrid(shown)
  const filter = (category) => {
    if (category === cat) return
    captureGrid()
    setCat(category)
  }
  const sortBy = (value) => {
    captureGrid()
    setSort(value)
  }
  const search = (value) => {
    captureGrid()
    setQ(value)
  }
  return (
    <div className="page">
      <p className="eyebrow">Каталог музея</p>
      <h1 className="h">Экспозиция</h1>
      <p className="lead">Найдите идею, которую захотите продолжить.</p>
      <div className="filters">
        <div className="search"><Icon name="search" /><input type="search" placeholder="Поиск по названию и описанию" value={q} onChange={(e) => search(e.target.value)} aria-label="Поиск по идеям" /></div>
        <select value={sort} onChange={(e) => sortBy(e.target.value)} aria-label="Сортировка">
          <option value="new">Сначала новые</option>
          <option value="likes">Больше всего откликов</option>
          <option value="open">Ждут продолжения</option>
          <option value="done">Нашли продолжение</option>
        </select>
      </div>
      <div className="chips" role="group" aria-label="Тематические разделы">
        {['Все', ...CATS].map((category) => (
          <button key={category} className={cat === category ? 'on' : ''} aria-pressed={cat === category} onClick={() => filter(category)}>{category}</button>
        ))}
      </div>
      <p className="results" role="status">{error || (ideas ? 'Найдено: ' + shown.length : 'Загружаем экспозицию…')}</p>
      {error && <button className="btn alt" onClick={() => reload()}>Попробовать ещё раз</button>}
      {shown.length > 0 && <div className="grid" ref={grid}>{shown.map((i, index) => <IdeaCard key={i.id} idea={i} reload={reload} order={index % 3} />)}</div>}
      {ideas && !shown.length && !error && <div className="empty"><p>По этим условиям экспонатов нет.</p><button className="link" onClick={() => { setCat('Все'); setQ(''); setSort('new') }}>Сбросить фильтры</button></div>}
    </div>
  )
}

export function IdeaPage() {
  const { id } = useParams()
  const { user, toast } = useApp()
  const nav = useNavigate()
  const [idea, setIdea] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [anon, setAnon] = useState(true)
  const reload = async () => {
    setError('')
    try { setIdea(await api.idea(id)) } catch (e) { setError(e.message) }
  }
  useEffect(() => { reload() }, [id, user]) // eslint-disable-line
  const [like, liking] = useLike(idea || { id }, reload)
  const run = (fn, after) => async () => { try { await fn(); after ? after() : await reload() } catch (e) { toast(e.message) } }
  if (error) return <div className="page"><h1 className="h">Экспонат недоступен</h1><p>{error}</p><Link className="btn" to="/exhibition">К экспозиции</Link></div>
  if (!idea) return <div className="page"><p>Загружаю…</p></div>
  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      await api.take(idea.id, { text, anon })
      setText('')
      await reload()
      toast('Продолжение опубликовано')
    } catch (er) { toast(er.message) }
    finally { setBusy(false) }
  }
  const done = idea.sequels.length > 0
  return (
    <div className="page narrow">
      <Link to="/exhibition" className="back">К экспозиции</Link>
      <article className={'card big exhibit-detail ' + (done ? 'lit' : 'ghost')}>
        <div className="row2"><span className="tag">{idea.cat} · Экспонат № {String(idea.id).padStart(3, '0')}</span>{done && <span className="status">Есть продолжение</span>}</div>
        <h1 className="h">{idea.title}</h1>
        <p className="body">{idea.text}</p>
        <div className="foot">
          <span>{idea.by || 'Аноним'}, {fmt(idea.at)}</span>
          <button className={'like' + (idea.liked ? ' on' : '')} onClick={like} aria-pressed={idea.liked} disabled={liking}><Icon name="heart" /> Отклики · {idea.likes}</button>
        </div>
      </article>
      <h2 className="h">Продолжения</h2>
      {!done && <p>У этой идеи пока нет продолжений.</p>}
      {idea.sequels.map((s) => (
        <Reveal className="sequel" key={s.id}>
          <p>{s.text}</p>
          <small>{s.by || 'Аноним'}, {fmt(s.at)}</small>
          {(s.mine || user?.admin) && <button className="link" onClick={run(() => api.delSequel(s.id))}>Удалить</button>}
        </Reveal>
      ))}
      {user ? (
        <form className="form" onSubmit={submit}>
          <h3>Добавить продолжение</h3>
          <label>Что вы сделали или собираетесь сделать?<textarea rows={4} required minLength={10} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Не показывать моё имя</label>
          <button className="btn" disabled={busy || text.trim().length < 10}>{busy ? 'Публикуем…' : 'Опубликовать продолжение'}</button>
        </form>
      ) : <p><Link to="/login" state={{ from: '/idea/' + idea.id }}>Войдите</Link>, чтобы забрать идею.</p>}
      <div className="manage">
        {(idea.mine || user?.admin)
          ? <button className="link" onClick={() => confirm('Удалить идею навсегда?') && run(() => api.del(idea.id), () => nav('/exhibition'))()}>Удалить идею</button>
          : user && <button className="link" onClick={() => confirm('Пожаловаться на эту идею?') && run(() => api.report(idea.id), () => { toast('Жалоба принята'); nav('/exhibition') })()}>Пожаловаться</button>}
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
  const ok = Boolean(f.title.trim()) && f.text.trim().length >= 20
  const send = async (e) => {
    e.preventDefault()
    if (busy || !ok) return
    setBusy(true)
    try { const { id } = await api.add(f); nav('/idea/' + id) } catch (er) { toast(er.message); setBusy(false) }
  }
  return (
    <div className="page narrow">
      <p className="eyebrow">Пополнить коллекцию</p>
      <h1 className="h">Сдать идею</h1>
      <p className="lead">Опишите замысел так, чтобы другой человек мог его подхватить.</p>
      <form className="form" onSubmit={send}>
        <label>Название<input required placeholder="Короткое название экспоната" value={f.title} maxLength={70} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label>Что это было и почему не вышло
          <textarea rows={6} required minLength={20} maxLength={1500} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
        </label>
        <span className="form-footer">{f.text.length} / 1500</span>
        <label>Раздел<select value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={f.anon} onChange={(e) => setF({ ...f, anon: e.target.checked })} /> Опубликовать анонимно</label>
        <button className="btn big" disabled={!ok || busy}>{busy ? 'Отправляю…' : 'Передать в музей'}</button>
      </form>
    </div>
  )
}
