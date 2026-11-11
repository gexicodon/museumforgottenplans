import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from './api.js'

export const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)
export const fmt = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

export function useIdeas() {
  const { user, toast } = useApp()
  const [ideas, setIdeas] = useState(null)
  const reload = useCallback(() => api.ideas().then(setIdeas).catch((e) => toast(e.message)), [toast])
  useEffect(() => { reload() }, [reload, user])
  return [ideas, reload]
}

export function useLike(idea, reload) {
  const { user, toast } = useApp(), nav = useNavigate()
  return async () => {
    if (!user) return nav('/login', { state: { from: '/idea/' + idea.id } })
    try { await api.like(idea.id); await reload() } catch (e) { toast(e.message) }
  }
}

export function IdeaCard({ idea, reload }) {
  const like = useLike(idea, reload)
  const done = idea.sequels.length > 0
  return (
    <article className={'card reveal ' + (done ? 'lit' : 'ghost')}>
      <div className="row2"><span className="tag">{idea.cat}</span><span className="inv">№ {String(idea.id).padStart(4, '0')}</span></div>
      <h3><Link to={`/idea/${idea.id}`}>{idea.title}</Link></h3>
      <p className="clamp">{idea.text}</p>
      {done && <p className="out"><b>Что вышло:</b> {idea.sequels[0].text}</p>}
      <div className="foot">
        <span>{idea.by || 'Аноним'}, {fmt(idea.at)}</span>
        <button className={'like' + (idea.liked ? ' on' : '')} onClick={like} aria-pressed={idea.liked} title="Жаль, что не сделано">♥ {idea.likes}</button>
      </div>
    </article>
  )
}

export function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { threshold: 0.1 })
    const scan = () => document.querySelectorAll('.reveal:not(.in):not([data-o])').forEach((el) => { el.dataset.o = 1; io.observe(el) })
    scan()
    const mo = new MutationObserver(scan)
    mo.observe(document.body, { childList: true, subtree: true })
    return () => { io.disconnect(); mo.disconnect() }
  }, [])
}

export function CountUp({ to }) {
  const [n, setN] = useState(0)
  const raf = useRef()
  useEffect(() => {
    const t0 = performance.now()
    const tick = (t) => { const k = Math.min(1, (t - t0) / 1200); setN(Math.round(to * (1 - (1 - k) ** 3))); if (k < 1) raf.current = requestAnimationFrame(tick) }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [to])
  return n
}
