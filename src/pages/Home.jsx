import { useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { CATS } from '../api.js'
import { CountUp, IdeaCard, useApp, useIdeas } from '../components.jsx'

export default function Home() {
  const { user } = useApp()
  const [ideas, reload] = useIdeas()
  const h1 = useRef()
  const list = ideas || []
  const done = list.filter((i) => i.sequels.length)
  const open = [...list.filter((i) => !i.sequels.length)].sort((a, b) => b.likes - a.likes).slice(0, 3)
  const motes = useMemo(() => Array.from({ length: 18 }, (_, i) => {
    const r = (k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x) }
    return { left: r(1) * 100 + '%', '--w': 2 + r(2) * 4 + 'px', '--t': 9 + r(3) * 10 + 's', '--dl': -r(4) * 14 + 's', '--dx': (r(5) - 0.5) * 120 + 'px' }
  }), [])
  const light = (e) => {
    const r = h1.current.getBoundingClientRect(), el = h1.current
    el.style.setProperty('--mx', e.clientX - r.left + 'px'); el.style.setProperty('--my', e.clientY - r.top + 'px')
  }
  const ticker = list.map((i) => i.title)

  return (
    <>
      <section className="hero" onMouseMove={light}>
        <div className="beam" aria-hidden="true" /><div className="beam b2" aria-hidden="true" />
        {motes.map((m, i) => <i key={i} className="mote" style={m} aria-hidden="true" />)}
        <h1 ref={h1}>Музей несбывшихся планов</h1>
        <p className="lead">Люди анонимно оставляют здесь идеи, до которых не дошли руки. Любой может забрать идею, довести её до конца и показать, что получилось.</p>
        <div className="cta">
          <Link className="btn big" to={user ? '/submit' : '/register'}>Сдать свою идею</Link>
          <Link className="btn big alt" to="/exhibition">Смотреть экспозицию</Link>
        </div>
        <p className="stats">На хранении <b><CountUp to={list.length} /></b> идей. <b><CountUp to={done.length} /></b> уже нашли продолжение.</p>
      </section>

      {ticker.length > 0 && (
        <div className="ticker" aria-hidden="true">
          <div>{[...ticker, ...ticker].map((t, i) => <span key={i}>{t}<em>◆</em></span>)}</div>
        </div>
      )}

      <section className="block">
        <h2 className="h">Залы музея</h2>
        <div className="arches">
          {CATS.map((c) => (
            <Link key={c} className="arch reveal" to={'/exhibition?cat=' + encodeURIComponent(c)}>
              <span className="room"><b>{list.filter((i) => i.cat === c).length}</b><small>идей внутри</small></span>
              <span className="door"><span>{c}</span></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="block">
        <h2 className="h">Как это работает</h2>
        <ol className="steps">
          <li className="reveal"><span>1</span><h3>Сдайте идею</h3><p>Расскажите, что вы хотели сделать и почему не получилось. Подпись можно не ставить.</p></li>
          <li className="reveal"><span>2</span><h3>Её заберут</h3><p>Кто-то прочитает, загорится и возьмёт идею в работу. Музей подскажет и сочетания, которые вы не заметили.</p></li>
          <li className="reveal"><span>3</span><h3>Покажут результат</h3><p>Карточка загорается жёлтым, и все видят, что из пустой рамки вышло.</p></li>
        </ol>
      </section>

      {open.length > 0 && (
        <section className="block">
          <h2 className="h">Ждут хозяина</h2>
          <div className="grid">{open.map((i) => <IdeaCard key={i.id} idea={i} reload={reload} />)}</div>
        </section>
      )}
      {done.length > 0 && (
        <section className="block">
          <h2 className="h">Нашли продолжение</h2>
          <div className="grid">{done.slice(0, 3).map((i) => <IdeaCard key={i.id} idea={i} reload={reload} />)}</div>
        </section>
      )}
    </>
  )
}
