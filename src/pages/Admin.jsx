import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useApp } from '../components.jsx'

const labels = { user: 'Пользователь', moderator: 'Модератор', admin: 'Администратор' }
export default function Admin() {
  const { user, setUser } = useApp()
  const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [offset, setOffset] = useState(0)
  const [users, setUsers] = useState(null), [audit, setAudit] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    setError(''); setUsers(null)
    try { const [u, a] = await Promise.all([api.adminUsers(search, offset), api.adminAudit()]); setUsers(u); setAudit(a.entries) }
    catch (e) { setError(e.message) }
  }, [search, offset])
  useEffect(() => { if (user?.admin) load() }, [user?.admin, load])
  if (!user) return <div className="page"><h1 className="h">Администрация</h1><p><Link to="/login" state={{ from: '/admin' }}>Войдите</Link>, чтобы продолжить.</p></div>
  if (!user.admin) return <div className="page"><h1 className="h">Доступ закрыт</h1><p>Раздел доступен администраторам.</p></div>
  const changeRole = async (target, role) => {
    if (role === target.role || !window.confirm(`Изменить роль пользователя «${target.name}»: ${labels[target.role]} → ${labels[role]}?`)) return
    setBusy(true); setError('')
    try {
      await api.adminSetRole(target.id, role)
      if (target.id === user.id) setUser({ ...user, role, admin: role === 'admin' })
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <div className="page">
    <h1 className="h">Администрация</h1>
    <p className="lead sm">Пользователи и роли</p>
    <form className="filters" onSubmit={(e) => { e.preventDefault(); setOffset(0); setSearch(query) }}>
      <label>Поиск по имени или почте<input value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} /></label>
      <button className="btn sm">Найти</button>
    </form>
    {error && <p role="alert">{error} <button className="link" onClick={load}>Повторить</button></p>}
    {!users && !error && <p>Загружаю…</p>}
    {users && <><div className="grid">{users.users.map((item) => <article className="card ghost" key={item.id}>
      <h3>{item.name}</h3><p>{item.email}</p><small>ID {item.id}</small>
      <label>Роль<select value={item.role} disabled={busy} onChange={(e) => changeRole(item, e.target.value)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </article>)}</div>
      {!users.users.length && <p>Пользователи не найдены.</p>}
      <div className="cta">{offset > 0 && <button className="btn alt sm" onClick={() => setOffset(Math.max(0, offset - 100))}>Назад</button>}{users.nextOffset !== null && <button className="btn alt sm" onClick={() => setOffset(users.nextOffset)}>Далее</button>}</div>
    </>}
    <h2 className="h" style={{ marginTop: '2rem' }}>Журнал изменений ролей</h2>
    {!audit.length ? <p>Записей пока нет.</p> : <ul className="taken">{audit.map((entry) => <li key={entry.id}>
      <b>{entry.actor_id === null ? 'Назначение оператором сервера' : `Исполнитель #${entry.actor_id}`}</b>: пользователь #{entry.target_id}, {labels[entry.old_role]} → {labels[entry.new_role]}; {new Date(entry.at).toLocaleString('ru-RU')}
    </li>)}</ul>}
  </div>
}
