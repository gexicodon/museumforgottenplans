import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from './api.js'
import { Reveal } from './motion.jsx'

export const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)
export const fmt = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

const icons = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'm6 6 12 12M18 6 6 18',
  heart: 'M20.8 8.6c0 4.3-8.8 9.2-8.8 9.2s-8.8-4.9-8.8-9.2a4.4 4.4 0 0 1 8.8 0 4.4 4.4 0 0 1 8.8 0Z',
  chip: 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4m6-4v4m-6 10v4m6-4v4M3 9h4m-4 6h4m10-6h4m-4 6h4',
  art: 'M4 5h16v14H4zM7 15l3-3 3 3 2-2 2 2M15 9h.01',
  city: 'M3 20h18M5 20V9h6v11m0 0V4h8v16M8 12h.01m0 4h.01M15 8h.01m0 4h.01m0 4h.01',
  science: 'M9 3h6m-5 0v7l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 15h8',
  case: 'M4 8h16v12H4zM9 8V4h6v4M4 13h16m-9 0v2h2v-2',
  map: 'm3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14m6-12v14',
  home: 'm3 11 9-8 9 8m-16-1v10h14V10m-9 10v-6h4v6',
  archive: 'M4 5h16v4H4zM6 9v11h12V9m-8 4h4',
  spark: 'M12 2c0 6-4 10-10 10 6 0 10 4 10 10 0-6 4-10 10-10-6 0-10-4-10-10Z',
  frame: 'M3 4h18v16H3zM7 8h10v8H7z',
  search: 'M15.5 15.5 21 21m-3.8-9.8a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
}

export function Icon({ name }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name]} /></svg>
}

export function useIdeas() {
  const { user } = useApp()
  const [ideas, setIdeas] = useState(null)
  const [error, setError] = useState('')
  const reload = useCallback(async (signal) => {
    setError('')
    try {
      const data = await api.ideas(signal)
      if (!signal?.aborted) setIdeas(data)
    } catch (e) {
      if (!signal?.aborted) setError(e.message)
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    if (user !== undefined) reload(controller.signal)
    return () => controller.abort()
  }, [reload, user])
  return [ideas, reload, error]
}

export function useLike(idea, reload) {
  const { user, toast } = useApp()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const like = async () => {
    if (busy || user === undefined) return
    if (!user) return nav('/login', { state: { from: '/idea/' + idea.id } })
    setBusy(true)
    try { await api.like(idea.id); await reload() } catch (e) { toast(e.message) }
    finally { setBusy(false) }
  }
  return [like, busy]
}

const coverByTitle = {
  'Карта звуков исчезающих мест': 'sound',
  'Тихий поезд': 'train',
  'Абонемент на починку вещей': 'repair',
}
const coverByCategory = { Искусство: 'sound', Путешествия: 'train', Быт: 'repair' }

export function IdeaCard({ idea, reload, order }) {
  const [like, busy] = useLike(idea, reload)
  const done = idea.sequels.length > 0
  const cover = coverByTitle[idea.title] || coverByCategory[idea.cat]
  return (
    <Reveal as="article" order={order} className={'card exhibit ' + (done ? 'lit' : 'ghost')}>
      <div className={'card-cover ' + (cover ? 'has-cover' : 'abstract-cover')} aria-hidden="true">
        {cover ? <img src={'/assets/' + cover + '.webp'} width="512" height="560" loading="lazy" alt="" /> : <Icon name={done ? 'spark' : 'frame'} />}
      </div>
      <div className="card-inner">
        <div className="row2"><span className="tag">{idea.cat}</span>{done && <span className="status">Есть продолжение</span>}</div>
        <h3><Link to={'/idea/' + idea.id}>{idea.title}</Link></h3>
        <p className="clamp">{idea.text}</p>
        {done && <p className="out clamp"><b>Продолжение.</b> {idea.sequels[0].text}</p>}
        <div className="foot">
          <span>{idea.by || 'Аноним'}</span>
          <button className={'like' + (idea.liked ? ' on' : '')} onClick={like} aria-pressed={idea.liked} aria-label={'Откликнуться. Откликов: ' + idea.likes} disabled={busy}><Icon name="heart" /> {idea.likes}</button>
        </div>
      </div>
    </Reveal>
  )
}
