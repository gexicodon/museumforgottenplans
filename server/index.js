import express from 'express'
import rateLimit from 'express-rate-limit'
import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clusterLocal, nameHall, combine, localCombo } from './ai.js'

const { PORT = 3001, DB_PATH = 'data/museum-v3.db', ADMIN_EMAIL = '', ANTHROPIC_API_KEY = '' } = process.env
const CATS = ['Технологии', 'Искусство', 'Город', 'Наука', 'Бизнес', 'Путешествия', 'Быт']
const DAY = 864e5

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT UNIQUE COLLATE NOCASE NOT NULL, email TEXT UNIQUE COLLATE NOCASE NOT NULL, pass TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, exp INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ideas(id INTEGER PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, cat TEXT NOT NULL, user_id INTEGER, anon INTEGER DEFAULT 1, at INTEGER NOT NULL, hidden INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS likes(idea_id INTEGER, user_id INTEGER, PRIMARY KEY(idea_id, user_id));
CREATE TABLE IF NOT EXISTS reports(idea_id INTEGER, user_id INTEGER, PRIMARY KEY(idea_id, user_id));
CREATE TABLE IF NOT EXISTS sequels(id INTEGER PRIMARY KEY, idea_id INTEGER NOT NULL, user_id INTEGER, anon INTEGER DEFAULT 1, text TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cache(k TEXT PRIMARY KEY, v TEXT);`)

if (!db.prepare('SELECT 1 FROM ideas').get()) {
  const ins = db.prepare('INSERT INTO ideas(title,text,cat,at) VALUES(?,?,?,?)'), now = Date.now()
  ;[
    ['Библиотека соседских навыков', 'Доска в подъезде, где каждый пишет, чему может научить за чашку чая: чинить велосипед, играть на укулеле. Не хватило смелости повесить первую записку.', 'Город'],
    ['Карта звуков исчезающих мест', 'Записывать звук мест, которые скоро снесут: рынок, проходной двор, старый вокзал, и собрать их в звуковую карту.', 'Искусство'],
    ['Тихий поезд', 'Вагон без телефонов и разговоров, только книги, окна и чай. Ночной маршрут между двумя северными городами.', 'Путешествия'],
    ['Абонемент на починку вещей', 'Подписка: раз в месяц мастер забирает сломанную вещь, чинит и возвращает. Против культуры «проще купить новое».', 'Бизнес'],
    ['Городские часы тишины', 'Час в неделю на одном районе отключают музыку из кафе, стройку и рекламные экраны, чтобы люди услышали свою улицу.', 'Город'],
  ].forEach(([t, x, c], i) => ins.run(t, x, c, now - (i + 1) * 9 * DAY))
  db.prepare('INSERT INTO sequels(idea_id,text,at) VALUES(1,?,?)').run('Повесили доску в двух домах. За месяц записалось 17 человек, самый популярный навык — ремонт стиральных машин.', now - 3 * DAY)
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const hashPw = (p) => { const s = crypto.randomBytes(16); return s.toString('hex') + ':' + crypto.scryptSync(p, s, 64).toString('hex') }
const checkPw = (p, st) => { const [s, h] = st.split(':'); return crypto.timingSafeEqual(crypto.scryptSync(p, Buffer.from(s, 'hex'), 64), Buffer.from(h, 'hex')) }
const isAdminEmail = (e) => !!ADMIN_EMAIL && e.toLowerCase() === ADMIN_EMAIL.toLowerCase()
const mkUser = (r) => ({ id: r.id, name: r.name, admin: isAdminEmail(r.email) })
const bad = (m, status = 400) => Object.assign(new Error(m), { status })
const need = (req) => req.user || bad('Войдите в аккаунт', 401)
const clean = (s, max) => String(s ?? '').trim().slice(0, max)
const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  if (!e.status) console.error(e)
  res.status(e.status || 500).json({ error: e.status ? e.message : 'Ошибка сервера' })
})
const cached = async (key, fn) => {
  const r = db.prepare('SELECT v FROM cache WHERE k=?').get(key)
  if (r) return JSON.parse(r.v)
  const v = await fn()
  db.prepare('INSERT OR REPLACE INTO cache VALUES(?,?)').run(key, JSON.stringify(v))
  return v
}
const visible = () => db.prepare('SELECT id,title,text,cat FROM ideas WHERE hidden=0').all()
const byIds = (ids) => ids.map((id) => db.prepare('SELECT id,title,text,cat FROM ideas WHERE hidden=0 AND id=?').get(Number(id))).filter(Boolean)
const hallKey = (ids) => 'hall:' + [...ids].sort((a, b) => a - b).join(',')

function startSession(req, res, uid) {
  const t = crypto.randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(t), uid, Date.now() + 30 * DAY)
  res.setHeader('Set-Cookie', `sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${req.secure ? '; Secure' : ''}`)
}

const SEL = `SELECT i.id,i.title,i.text,i.cat,i.at,i.anon,i.user_id uid,u.name author,
  (SELECT COUNT(*) FROM likes l WHERE l.idea_id=i.id) likes,
  EXISTS(SELECT 1 FROM likes l WHERE l.idea_id=i.id AND l.user_id=@me) liked
  FROM ideas i LEFT JOIN users u ON u.id=i.user_id`
function shape(rows, me) {
  const sq = db.prepare('SELECT s.id,s.idea_id,s.text,s.at,s.anon,s.user_id,u.name FROM sequels s LEFT JOIN users u ON u.id=s.user_id ORDER BY s.at').all()
  return rows.map((i) => ({
    id: i.id, title: i.title, text: i.text, cat: i.cat, at: i.at, likes: i.likes, liked: !!i.liked,
    by: i.anon ? null : i.author, mine: !!me && i.uid === me,
    sequels: sq.filter((s) => s.idea_id === i.id).map((s) => ({ id: s.id, text: s.text, at: s.at, by: s.anon ? null : s.name, mine: !!me && s.user_id === me })),
  }))
}

const app = express()
app.set('trust proxy', 1)
app.use(express.json({ limit: '20kb' }))
app.use('/api', rateLimit({ windowMs: 60_000, limit: 150 }))
app.use('/api', (req, res, next) => (req.method === 'GET' || req.is('application/json') ? next() : res.status(415).json({ error: 'Неверный формат запроса' })))
app.use((req, _res, next) => {
  req.user = null
  const t = (req.get('cookie') || '').match(/(?:^|;\s*)sid=([a-f0-9]{64})/)?.[1]
  if (t) {
    const r = db.prepare('SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.exp>?').get(sha(t), Date.now())
    if (r) req.user = { ...mkUser(r), sid: sha(t) }
  }
  next()
})
const lim = (n, msg) => rateLimit({ windowMs: 3_600_000, limit: n, message: { error: msg } })
const authLimit = lim(30, 'Слишком много попыток входа. Попробуйте через час.')
const writeLimit = lim(30, 'Слишком много действий. Попробуйте позже.')
const aiLimit = lim(30, 'Лимит запросов к ИИ исчерпан. Попробуйте позже.')

app.get('/api/config', (_q, res) => res.json({ ai: !!ANTHROPIC_API_KEY, cats: CATS }))

// ---- аккаунты
app.get('/api/auth/me', (req, res) => res.json({ user: req.user && { id: req.user.id, name: req.user.name, admin: req.user.admin } }))
app.post('/api/auth/register', authLimit, h((req, res) => {
  const name = clean(req.body.name, 24), email = clean(req.body.email, 120).toLowerCase(), pw = String(req.body.password || '')
  if (!/^[\p{L}\p{N}_ .-]{2,24}$/u.test(name)) throw bad('Имя: 2–24 символа, буквы, цифры, пробел, точка или дефис')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Проверьте адрес почты')
  if (pw.length < 8 || pw.length > 100) throw bad('Пароль должен быть не короче 8 символов')
  try {
    const r = db.prepare('INSERT INTO users(name,email,pass,at) VALUES(?,?,?,?)').run(name, email, hashPw(pw), Date.now())
    startSession(req, res, r.lastInsertRowid)
    res.status(201).json({ user: mkUser({ id: r.lastInsertRowid, name, email }) })
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) throw bad('Такое имя или почта уже заняты', 409)
    throw e
  }
}))
app.post('/api/auth/login', authLimit, h((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(clean(req.body.email, 120))
  if (!u || !checkPw(String(req.body.password || ''), u.pass)) throw bad('Неверная почта или пароль', 401)
  startSession(req, res, u.id)
  res.json({ user: mkUser(u) })
}))
app.post('/api/auth/logout', h((req, res) => {
  if (req.user) db.prepare('DELETE FROM sessions WHERE id=?').run(req.user.sid)
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0')
  res.json({ ok: true })
}))
app.get('/api/profile', h((req, res) => {
  const u = need(req)
  const ideas = shape(db.prepare(SEL + ' WHERE i.user_id=@me AND i.hidden=0 ORDER BY i.at DESC').all({ me: u.id }), u.id)
  const taken = db.prepare('SELECT s.id,s.text,s.at,i.id idea_id,i.title FROM sequels s JOIN ideas i ON i.id=s.idea_id WHERE s.user_id=? ORDER BY s.at DESC').all(u.id)
  res.json({ ideas, taken })
}))

// ---- идеи
app.get('/api/ideas', h((req, res) => {
  res.json(shape(db.prepare(SEL + ' WHERE i.hidden=0 ORDER BY i.at DESC LIMIT 500').all({ me: req.user?.id ?? null }), req.user?.id))
}))
app.get('/api/ideas/:id', h((req, res) => {
  const r = db.prepare(SEL + ' WHERE i.hidden=0 AND i.id=@id').all({ me: req.user?.id ?? null, id: Number(req.params.id) })
  if (!r.length) throw bad('Идея не найдена', 404)
  res.json(shape(r, req.user?.id)[0])
}))
app.post('/api/ideas', writeLimit, h((req, res) => {
  const u = need(req)
  const title = clean(req.body.title, 70), text = clean(req.body.text, 1500), cat = req.body.cat
  if (!title) throw bad('Введите название')
  if (text.length < 20) throw bad('Опишите идею хотя бы в двух предложениях')
  if (!CATS.includes(cat)) throw bad('Неизвестный раздел')
  const r = db.prepare('INSERT INTO ideas(title,text,cat,user_id,anon,at) VALUES(?,?,?,?,?,?)').run(title, text, cat, u.id, req.body.anon === false ? 0 : 1, Date.now())
  res.status(201).json({ id: r.lastInsertRowid })
}))
app.delete('/api/ideas/:id', h((req, res) => {
  const u = need(req), id = Number(req.params.id)
  const idea = db.prepare('SELECT user_id FROM ideas WHERE id=?').get(id)
  if (!idea) throw bad('Идея не найдена', 404)
  if (!u.admin && idea.user_id !== u.id) throw bad('Удалять можно только свои идеи', 403)
  db.transaction(() => {
    for (const t of ['likes', 'reports', 'sequels']) db.prepare(`DELETE FROM ${t} WHERE idea_id=?`).run(id)
    db.prepare('DELETE FROM ideas WHERE id=?').run(id)
  })()
  res.json({ ok: true })
}))
app.post('/api/ideas/:id/like', h((req, res) => {
  const u = need(req), id = Number(req.params.id)
  if (!db.prepare('SELECT 1 FROM ideas WHERE id=? AND hidden=0').get(id)) throw bad('Идея не найдена', 404)
  if (!db.prepare('DELETE FROM likes WHERE idea_id=? AND user_id=?').run(id, u.id).changes) db.prepare('INSERT INTO likes VALUES(?,?)').run(id, u.id)
  res.json({ ok: true })
}))
app.post('/api/ideas/:id/sequels', writeLimit, h((req, res) => {
  const u = need(req), id = Number(req.params.id), text = clean(req.body.text, 1500)
  if (!db.prepare('SELECT 1 FROM ideas WHERE id=? AND hidden=0').get(id)) throw bad('Идея не найдена', 404)
  if (text.length < 10) throw bad('Расскажите, что вы сделали, хотя бы в одном предложении')
  db.prepare('INSERT INTO sequels(idea_id,user_id,anon,text,at) VALUES(?,?,?,?,?)').run(id, u.id, req.body.anon ? 1 : 0, text, Date.now())
  res.status(201).json({ ok: true })
}))
app.delete('/api/sequels/:id', h((req, res) => {
  const u = need(req), s = db.prepare('SELECT user_id FROM sequels WHERE id=?').get(Number(req.params.id))
  if (!s) throw bad('Не найдено', 404)
  if (!u.admin && s.user_id !== u.id) throw bad('Удалять можно только свои записи', 403)
  db.prepare('DELETE FROM sequels WHERE id=?').run(Number(req.params.id))
  res.json({ ok: true })
}))
app.post('/api/ideas/:id/report', h((req, res) => {
  const u = need(req), id = Number(req.params.id)
  db.prepare('INSERT OR IGNORE INTO reports VALUES(?,?)').run(id, u.id)
  if (db.prepare('SELECT COUNT(*) n FROM reports WHERE idea_id=?').get(id).n >= 3) db.prepare('UPDATE ideas SET hidden=1 WHERE id=?').run(id)
  res.json({ ok: true })
}))

// ---- ИИ
app.get('/api/halls', h((_q, res) => {
  res.json(clusterLocal(visible()).map((g) => {
    const ids = g.map((i) => i.id), r = db.prepare('SELECT v FROM cache WHERE k=?').get(hallKey(ids))
    return { ids, ideas: g.map(({ id, title }) => ({ id, title })), ai: r ? JSON.parse(r.v) : null }
  }))
}))
app.post('/api/halls/name', aiLimit, h(async (req, res) => {
  need(req)
  if (!ANTHROPIC_API_KEY) throw bad('ИИ не подключён на сервере', 503)
  const g = byIds((req.body.ids || []).slice(0, 8))
  if (g.length < 2) throw bad('Нужно минимум две идеи')
  try { res.json(await cached(hallKey(g.map((i) => i.id)), () => nameHall(g))) } catch (e) { console.error(e); throw bad('ИИ сейчас недоступен', 502) }
}))
app.get('/api/pair', h((_q, res) => {
  const all = visible(), pairs = []
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (all[i].cat !== all[j].cat) pairs.push([all[i], all[j]])
  if (!pairs.length) throw bad('Нужны идеи из разных разделов', 404)
  const [a, b] = pairs[Math.floor(Math.random() * pairs.length)]
  res.json({ a, b })
}))
app.post('/api/combine', aiLimit, h(async (req, res) => {
  need(req)
  const [a, b] = byIds([req.body.a, req.body.b])
  if (!a || !b) throw bad('Идеи не найдены', 404)
  if (!ANTHROPIC_API_KEY) return res.json({ ...localCombo(a, b), ai: false })
  try { res.json({ ...(await cached('mix:' + [a.id, b.id].sort((x, y) => x - y).join(','), () => combine(a, b))), ai: true }) }
  catch (e) { console.error(e); res.json({ ...localCombo(a, b), ai: false }) }
}))

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (_q, res) => res.sendFile(path.join(dist, 'index.html')))
}
app.listen(PORT, () => console.log(`Музей открыт: http://localhost:${PORT}`))
