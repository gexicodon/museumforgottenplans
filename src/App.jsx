import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { api } from './api.js'
import { AppCtx, Icon } from './components.jsx'
import Home from './pages/Home.jsx'
import { Exhibition, IdeaPage, Submit } from './pages/Ideas.jsx'
import { Halls, Mix } from './pages/Ai.jsx'
import { Auth, Profile } from './pages/Account.jsx'

function MuseumMark() {
  return <span className="mark" aria-hidden="true"><i /></span>
}

export default function App() {
  const [user, setUser] = useState(undefined)
  const [msg, setMsg] = useState('')
  const [menu, setMenu] = useState(false)
  const timer = useRef()
  const { pathname } = useLocation()
  const toast = useCallback((message) => {
    setMsg(message)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(''), 5000)
  }, [])
  useEffect(() => { api.me().then((r) => setUser(r.user)).catch(() => setUser(null)) }, [])
  useEffect(() => {
    window.scrollTo(0, 0)
    setMenu(false)
    const titles = { '/exhibition': 'Экспозиция', '/halls': 'Залы сходств', '/mix': 'Сочетания', '/submit': 'Сдать идею', '/login': 'Вход', '/register': 'Регистрация', '/profile': 'Личный кабинет' }
    document.title = [titles[pathname] || (pathname.startsWith('/idea/') && 'Экспонат'), 'Музей несбывшихся планов'].filter(Boolean).join(' · ')
  }, [pathname])
  useEffect(() => () => clearTimeout(timer.current), [])
  const logout = async () => {
    try { await api.logout(); setUser(null); setMenu(false) } catch (e) { toast(e.message) }
  }

  return (
    <AppCtx.Provider value={{ user, setUser, toast }}>
      <a href="#main" className="skip">Перейти к содержимому</a>
      <header className="top">
        <div className="wrap bar">
          <Link to="/" className="logo" aria-label="Музей несбывшихся планов — главная"><MuseumMark /><span>Музей несбывшихся<br />планов</span></Link>
          <nav id="main-nav" aria-label="Главное меню" className={menu ? 'nav open' : 'nav'}>
            <NavLink to="/exhibition" onClick={() => setMenu(false)}>Экспозиция</NavLink>
            <NavLink to="/halls" onClick={() => setMenu(false)}>Залы сходств</NavLink>
            <NavLink to="/mix" onClick={() => setMenu(false)}>Сочетания</NavLink>
            <div className="mobile-account">
              {user ? <><Link to="/profile">Личный кабинет</Link><button className="link" onClick={logout}>Выйти</button></> : <Link to="/login">Войти</Link>}
              <Link to="/submit">Сдать идею</Link>
            </div>
          </nav>
          <div className="acc">
            {user ? <><Link className="account-link" to="/profile">{user.name}</Link><button className="btn alt sm" onClick={logout}>Выйти</button></> : <><Link className="account-link" to="/login">Войти</Link><Link className="btn alt sm" to="/submit">Сдать идею</Link></>}
          </div>
          <button className="menu-toggle" type="button" aria-expanded={menu} aria-controls="main-nav" aria-label={menu ? 'Закрыть меню' : 'Открыть меню'} onClick={() => setMenu(!menu)}><Icon name={menu ? 'close' : 'menu'} /></button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <div key={pathname} className="route">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/exhibition" element={<Exhibition />} />
            <Route path="/idea/:id" element={<IdeaPage />} />
            <Route path="/halls" element={<Halls />} />
            <Route path="/mix" element={<Mix />} />
            {user === undefined
              ? <Route path="*" element={<div className="page"><p role="status">Проверяем вход…</p></div>} />
              : <>
                <Route path="/submit" element={<Submit />} />
                <Route path="/login" element={<Auth mode="login" />} />
                <Route path="/register" element={<Auth mode="register" />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="*" element={<div className="page"><h1 className="h">Такого зала нет</h1><Link className="btn" to="/">На главную</Link></div>} />
              </>}
          </Routes>
        </div>
      </main>
      <footer className="footer">
        <div className="wrap footer-inner">
          <Link to="/" className="logo"><MuseumMark /><span>Музей несбывшихся<br />планов</span></Link>
          <span>Интерактивный архив идей · Курсовой проект</span>
          <nav aria-label="Разделы музея"><Link to="/exhibition">Экспозиция</Link><Link to="/submit">Сдать идею</Link></nav>
        </div>
      </footer>
      <div className={msg ? 'toast' : 'sr-only'} role="status">{msg}</div>
    </AppCtx.Provider>
  )
}
