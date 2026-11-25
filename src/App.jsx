import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { api } from './api.js'
import { AppCtx, useReveal } from './components.jsx'
import Home from './pages/Home.jsx'
import { Exhibition, IdeaPage, Submit } from './pages/Ideas.jsx'
import { Halls, Mix } from './pages/Ai.jsx'
import { Auth, Profile } from './pages/Account.jsx'
import Admin from './pages/Admin.jsx'
import Architect from './pages/Architect.jsx'

export default function App() {
  const [user, setUser] = useState(undefined)
  const [msg, setMsg] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef(null)
  const timer = useRef()
  const { pathname } = useLocation()
  const [gate, setGate] = useState(() => { try { return !sessionStorage.getItem('opened') && !matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } })
  useReveal()
  const toast = useCallback((m) => { setMsg(m); clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(''), 5000) }, [])
  useEffect(() => { api.me().then((r) => setUser(r.user)).catch(() => setUser(null)) }, [])
  useEffect(() => { window.scrollTo(0, 0); setMenuOpen(false) }, [pathname])
  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (e) => { if (e.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus() } }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])
  if (user === undefined) return null
  const logout = async () => { await api.logout(); setUser(null) }

  return (
    <AppCtx.Provider value={{ user, setUser, toast }}>
      {gate && (
        <div className="gate" aria-hidden="true" onAnimationEnd={(e) => { if (e.target === e.currentTarget) { try { sessionStorage.setItem('opened', '1') } catch {} setGate(false) } }}>
          <i className="l" /><i className="r" />
          <h2>Музей несбывшихся планов</h2>
        </div>
      )}
      <header className="top">
        <div className="wrap bar">
          <Link to="/" className="logo" onClick={() => setMenuOpen(false)}>Музей<br />несбывшихся<br /> планов</Link>
          <button ref={menuButton} className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="site-menu" aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} onClick={() => setMenuOpen((open) => !open)}>
            <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span><span>Меню</span>
          </button>
          <div id="site-menu" className={'site-menu' + (menuOpen ? ' is-open' : '')} onClick={(e) => { if (e.target.closest('a')) setMenuOpen(false) }}>
          <nav aria-label="Основная навигация">
            <NavLink to="/exhibition">Экспозиция</NavLink>
            <NavLink to="/halls">Залы</NavLink>
            <NavLink to="/mix">Сочетания</NavLink>
            {user?.admin && <NavLink to="/admin">Админка</NavLink>}
            <NavLink to="/architect">Архитектор</NavLink>
          </nav>
          <div className="acc">
            {user ? (
              <>
                <Link className="btn alt sm" to="/profile">{user.name}</Link>
                <button className="btn ghostbtn sm" onClick={() => { setMenuOpen(false); logout() }}>Выйти</button>
              </>
            ) : (
              <>
                <Link className="btn alt sm" to="/login">Войти</Link>
                <Link className="btn sm" to="/register">Регистрация</Link>
              </>
            )}
          </div>
          </div>
        </div>
      </header>
      <main className="wrap">
        <div key={pathname} className="route">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/exhibition" element={<Exhibition />} />
          <Route path="/idea/:id" element={<IdeaPage />} />
          <Route path="/submit" element={<Submit />} />
          <Route path="/halls" element={<Halls />} />
          <Route path="/mix" element={<Mix />} />
          <Route path="/architect" element={<Architect />} />
          <Route path="/login" element={<Auth mode="login" />} />
          <Route path="/register" element={<Auth mode="register" />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<div className="page"><h1 className="h">Такого зала нет</h1><Link className="btn" to="/">В начало</Link></div>} />
        </Routes>
        </div>
      </main>
      <div className="floor" aria-hidden="true" />
      <footer className="wrap foot2">Здесь хранятся идеи, до которых не дошли руки. Заберите одну и доведите до конца.</footer>
      {msg && <div className="toast" role="alert">{msg}</div>}
    </AppCtx.Provider>
  )
}
