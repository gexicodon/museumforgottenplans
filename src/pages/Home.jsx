import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { CATS } from '../api.js'
import { Icon, IdeaCard, useIdeas } from '../components.jsx'
import { GalleryAtmosphere, Reveal } from '../motion.jsx'

const roomIcons = ['chip', 'art', 'city', 'science', 'case', 'map', 'home']
const story = [
  ['archive', 'Сдайте идею', 'Расскажите, что вы хотели сделать и почему отложили. Опубликуйте историю от своего имени или анонимно.'],
  ['spark', 'Найдите то, что цепляет', 'Загляните в экспозицию или поставьте рядом две идеи из разных разделов и посмотрите, что их связывает.'],
  ['frame', 'Покажите продолжение', 'Возьмите идею в работу и расскажите о результате. В карточке появится новая глава.'],
]

export default function Home() {
  const [ideas, reload, error] = useIdeas()
  const gallery = useRef(null)
  const list = ideas || []
  const done = list.filter((idea) => idea.sequels.length)
  const waiting = list.filter((idea) => !idea.sequels.length)
  const picks = [...waiting].sort((a, b) => b.likes - a.likes).slice(0, 3)

  return (
    <>
      <section className="hero" ref={gallery}>
        <div className="hero-photo" aria-hidden="true" />
        <GalleryAtmosphere gallery={gallery} />
        <div className="wrap hero-inner">
          <div className="hero-content">
            <p className="eyebrow"><span />Цифровой архив идей</p>
            <h1><span>Музей</span>{' '}<span>несбывшихся</span>{' '}<em>планов.</em></h1>
            <p className="lead">Место для идей, которые так и не случились. Оставьте свою или продолжите чужую.</p>
            <div className="cta">
              <Link className="btn" to="/exhibition">Войти в экспозицию</Link>
              <Link className="btn hero-secondary" to="/submit">Сдать идею</Link>
            </div>
          </div>
          <div className="photo-caption"><span /> Пустая рама <b>·</b> Инсталляция</div>
        </div>
      </section>

      <div className="stats-strip">
        <div className="wrap stats">
          <div><strong>{ideas ? list.length : '—'}</strong><span>Идей на хранении</span></div>
          <div><strong>{CATS.length}</strong><span>Тематических разделов</span></div>
          <div><strong>{ideas ? done.length : '—'}</strong><span>Идей с продолжением</span></div>
        </div>
      </div>

      <div className="wrap">
        <section className="block" aria-labelledby="featured">
          <Reveal className="section-head">
            <div><p className="eyebrow">Подборка музея</p><h2 id="featured" className="h">В экспозиции</h2></div>
            <Link className="text-link" to="/exhibition">Вся экспозиция</Link>
          </Reveal>
          {picks.length > 0 ? <div className="grid">{picks.map((idea, index) => <IdeaCard key={idea.id} idea={idea} reload={reload} order={index} />)}</div>
            : error ? <p role="status">Экспозиция пока недоступна. <button className="link" onClick={() => reload()}>Попробовать ещё раз</button></p>
            : <p role="status">{ideas ? 'Все идеи уже нашли продолжение.' : 'Открываем экспозицию…'}</p>}
        </section>

        <section className="block" aria-labelledby="rooms">
          <Reveal className="section-head"><div><p className="eyebrow">Каталог</p><h2 id="rooms" className="h">Залы музея</h2></div></Reveal>
          <div className="rooms">
            {CATS.map((category, index) => (
              <Reveal as={Link} key={category} className="room" order={index % 3} to={'/exhibition?cat=' + encodeURIComponent(category)}>
                <Icon name={roomIcons[index]} />
                <span>{category}</span>
                {ideas && <span className="room-count" aria-label="Экспонатов">{list.filter((idea) => idea.cat === category).length}</span>}
              </Reveal>
            ))}
          </div>
        </section>

        {done.length > 0 && (
          <section className="block" aria-labelledby="continued">
            <Reveal className="section-head"><div><p className="eyebrow">Новая глава</p><h2 id="continued" className="h">Нашли продолжение</h2></div></Reveal>
            <div className="grid">{done.slice(0, 3).map((idea, index) => <IdeaCard key={idea.id} idea={idea} reload={reload} order={index} />)}</div>
          </section>
        )}

        <section className="block story" aria-labelledby="how">
          <Reveal as="h2" className="h" id="how">Как это работает</Reveal>
          <ol className="steps">
            {story.map(([icon, title, description], index) => <Reveal as="li" key={title} order={index}><Icon name={icon} /><h3>{title}</h3><p>{description}</p></Reveal>)}
          </ol>
        </section>

        <Reveal as="section" className="callout">
          <div><h2 className="h">Какой план вы отложили?</h2><p>В музее ему найдётся место.</p></div>
          <Link className="btn" to="/submit">Сдать идею</Link>
        </Reveal>
      </div>
    </>
  )
}
