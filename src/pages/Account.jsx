import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { fmt, IdeaCard, useApp } from '../components.jsx'

export function Auth({ mode }) {
  const reg = mode === 'register'
  const { user, setUser, toast } = useApp()
  const nav = useNavigate()
  const requested = useLocation().state?.from
  const from = typeof requested === 'string' && /^\/(?![\/\\])/.test(requested) ? requested : '/'
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [adminRegistration, setAdminRegistration] = useState(false)
  useEffect(() => {
    if (reg) api.config().then((config) => setAdminRegistration(config.adminRegistration)).catch(() => {})
  }, [reg])
  if (user) return <Navigate to={from} replace />
  const send = async (e) => {
    e.preventDefault(); setBusy(true)
    try { const r = await (reg ? api.register(f) : api.login(f)); setUser(r.user); nav(from, { replace: true }) } catch (er) { toast(er.message); setBusy(false) }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <div className="page narrow">
      <p className="eyebrow">Личный кабинет</p>
      <h1 className="h">{reg ? 'Создать аккаунт' : 'Войти в музей'}</h1>
      <p className="lead">{reg ? 'Публикуйте идеи и оставляйте продолжения к экспонатам.' : 'Войдите, чтобы сдать идею, откликнуться или добавить продолжение.'}</p>
      <form className="form" onSubmit={send}>
        {reg && <label>Имя на сайте<input required minLength={2} value={f.name} onChange={set('name')} autoComplete="username" maxLength={24} /></label>}
        <label>Почта<input required maxLength={120} type="email" value={f.email} onChange={set('email')} autoComplete="email" /></label>
        <label>Пароль{reg && ' (от 8 символов)'}<input required maxLength={100} minLength={reg ? 8 : undefined} type="password" value={f.password} onChange={set('password')} autoComplete={reg ? 'new-password' : 'current-password'} /></label>
        {reg && adminRegistration && <details><summary>Регистрация модератора</summary><label>Код настройки<input type="password" value={f.adminToken || ''} onChange={set('adminToken')} autoComplete="off" /></label></details>}
        <button className="btn big" disabled={busy}>{busy ? 'Минутку…' : reg ? 'Зарегистрироваться' : 'Войти'}</button>
        <p className="muted">{reg ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?'} <Link to={reg ? '/login' : '/register'} state={{ from }}>{reg ? 'Войти' : 'Создать'}</Link></p>
        {reg && <p className="muted">Имя видно, только если вы сами отключите анонимность у идеи или записи.</p>}
      </form>
    </div>
  )
}

export function Profile() {
  const { user, toast } = useApp()
  const [data, setData] = useState(null)
  const load = () => api.profile().then(setData).catch((e) => toast(e.message))
  useEffect(() => { if (user) load() }, [user]) // eslint-disable-line
  if (!user) return <Navigate to="/login" state={{ from: '/profile' }} replace />
  return (
    <div className="page">
      <h1 className="h">{user.name}</h1>
      {user.admin && <p className="tag">Модератор</p>}
      {!data ? <p>Загружаю…</p> : (
        <>
          <h2 className="h">Мои идеи на хранении</h2>
          {!data.ideas.length && <p>Вы ещё ничего не сдавали. <Link to="/submit">Сдать первую идею</Link>.</p>}
          <div className="grid">{data.ideas.map((i) => <IdeaCard key={i.id} idea={i} reload={load} />)}</div>
          <h2 className="h">Идеи, которые я забрал</h2>
          {!data.taken.length && <p>Вы пока не забирали идеи. <Link to="/exhibition">Выбрать в экспозиции</Link>.</p>}
          <ul className="taken">{data.taken.map((t) => (
            <li key={t.id}><Link to={'/idea/' + t.idea_id}>{t.title}</Link><p>{t.text}</p><small>{fmt(t.at)}</small></li>
          ))}</ul>
        </>
      )}
    </div>
  )
}
