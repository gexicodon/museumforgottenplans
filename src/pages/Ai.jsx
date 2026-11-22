import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useApp } from '../components.jsx'
import { Reveal } from '../motion.jsx'

export function Halls() {
  const { user, toast } = useApp()
  const [halls, setHalls] = useState(null)
  const [error, setError] = useState('')
  const [ai, setAi] = useState(false)
  const [busy, setBusy] = useState(null)
  const load = useCallback(async () => {
    setError('')
    try {
      const [groups, config] = await Promise.all([api.halls(), api.config()])
      setHalls(groups)
      setAi(config.ai)
    } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { load() }, [load])
  const name = async (group, index) => {
    setBusy(index)
    try {
      const result = await api.nameHall(group.ids)
      setHalls((current) => current.map((hall, i) => i === index ? { ...hall, ai: result } : hall))
    } catch (e) { toast(e.message) }
    finally { setBusy(null) }
  }
  return (
    <div className="page narrow">
      <p className="eyebrow">Связи между экспонатами</p>
      <h1 className="h">Залы сходств</h1>
      <p className="lead">В каждом зале собраны идеи, похожие по названию и описанию. Связанные экспонаты могут лежать в разных разделах.</p>
      {error ? <div className="empty hall"><p>{error}</p><button className="link" onClick={load}>Попробовать ещё раз</button></div>
        : !halls ? <p className="results" role="status">Подбираем похожие идеи…</p>
        : !halls.length && <div className="empty hall"><p>Похожие идеи пока не найдены.</p><Link to="/exhibition">Посмотреть экспозицию</Link></div>}
      {halls?.map((group, index) => (
        <Reveal as="section" className="card hall" key={group.ids.join('-')} order={index % 3}>
          <h3>{group.ai?.title || `Группа ${index + 1}`}</h3>
          <ul>{group.ideas.map((idea) => <li key={idea.id}><Link to={'/idea/' + idea.id}>{idea.title}</Link></li>)}</ul>
          {group.ai && <p className="out">{group.ai.merge}</p>}
          {ai && !group.ai && (user
            ? <button className="btn sm" disabled={busy !== null} onClick={() => name(group, index)}>{busy === index ? 'Готовим предложение…' : 'Предложить общее название'}</button>
            : <p><Link to="/login" state={{ from: '/halls' }}>Войдите</Link>, чтобы запросить название.</p>)}
        </Reveal>
      ))}
    </div>
  )
}

export function Mix() {
  const { user, toast } = useApp()
  const nav = useNavigate()
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const spin = async () => {
    if (!user) return nav('/login', { state: { from: '/mix' } })
    setBusy(true)
    try {
      const { a, b } = await api.pair()
      const result = await api.combine(a.id, b.id)
      setState((previous) => ({ a, b, result, round: (previous?.round ?? 0) + 1 }))
    } catch (e) { toast(e.message) }
    finally { setBusy(false) }
  }
  const save = async () => {
    const { a, result } = state
    setSaving(true)
    try {
      const { id } = await api.add({ title: result.title.slice(0, 70), text: `${result.pitch}\n\nПервый шаг — ${result.first_step}`, cat: a.cat, anon: true })
      nav('/idea/' + id)
    } catch (e) { toast(e.message) }
    finally { setSaving(false) }
  }
  return (
    <div className="page narrow">
      <p className="eyebrow">Мастерская музея</p>
      <h1 className="h">Неожиданные сочетания</h1>
      <p className="lead">Выберите случайную пару из разных разделов. Музей предложит, как превратить её в новый замысел.</p>
      <button className="btn big" onClick={spin} disabled={busy || saving || user === undefined}>{busy ? 'Подбираем сочетание…' : state ? 'Подобрать другую пару' : 'Подобрать пару идей'}</button>
      <p className="sr-only" role="status">{!busy && state && `Подобрано сочетание «${state.result.title}»`}</p>
      {state && (
        <section key={state.round} className="card lit combo" aria-busy={busy}>
          <div className="pairs"><Link to={'/idea/' + state.a.id}>{state.a.title}</Link><b aria-hidden="true">+</b><Link to={'/idea/' + state.b.id}>{state.b.title}</Link></div>
          <div className="mix-result">
            <p className="eyebrow">{state.result.ai ? 'Предложение Claude' : 'Идея из двух экспонатов'}</p>
            <h3>{state.result.title}</h3>
            <p>{state.result.pitch}</p>
            <p className="out"><b>Первый шаг.</b> {state.result.first_step}</p>
            <button className="btn alt sm" onClick={save} disabled={busy || saving}>{saving ? 'Сохраняем…' : 'Сдать сочетание анонимно'}</button>
          </div>
        </section>
      )}
    </div>
  )
}
