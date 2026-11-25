import express from 'express'

const roles = new Set(['user', 'moderator', 'admin'])
const error = (message, status = 400) => Object.assign(new Error(message), { status })
const positiveId = (value) => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw error('Неверный ID пользователя')
  return Number(value)
}

export function initializeRoles(db, configuredIds) {
  db.transaction(() => {
    if (!db.pragma('table_info(users)').some((column) => column.name === 'role')) {
      db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','moderator','admin'))")
    }
    db.exec("CREATE TABLE IF NOT EXISTS role_audit(id INTEGER PRIMARY KEY, actor_id INTEGER, target_id INTEGER NOT NULL, old_role TEXT NOT NULL, new_role TEXT NOT NULL, at INTEGER NOT NULL)")
    db.exec('CREATE TABLE IF NOT EXISTS role_bootstrap(id INTEGER PRIMARY KEY CHECK(id=1), completed_at INTEGER NOT NULL)')
    if (!db.prepare('SELECT 1 FROM role_bootstrap WHERE id=1').get()) {
      const admins = db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get().n
      if (!admins) {
        for (const id of configuredIds) if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(Number(id))) throw new Error('ADMIN_USER_IDS must contain only IDs of existing users')
        for (const id of configuredIds) {
          const user = db.prepare('SELECT role FROM users WHERE id=?').get(Number(id))
          db.prepare("UPDATE users SET role='admin' WHERE id=?").run(Number(id))
          db.prepare('INSERT INTO role_audit(actor_id,target_id,old_role,new_role,at) VALUES(NULL,?,?,?,?)').run(Number(id), user.role, 'admin', Date.now())
        }
      }
      if (admins || configuredIds.size) db.prepare('INSERT INTO role_bootstrap(id,completed_at) VALUES(1,?)').run(Date.now())
    }
  }).immediate()
}

export function adminRouter(db, need) {
  const router = express.Router()
  const wrap = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next)
  router.use(wrap((req, _res, next) => { if (need(req).role !== 'admin') throw error('Доступ только администратору', 403); next() }))
  router.get('/users', wrap((req, res) => {
    if (typeof req.query.q !== 'undefined' && typeof req.query.q !== 'string') throw error('Неверный поиск')
    const q = (req.query.q || '').trim().slice(0, 100).replace(/[\\%_]/g, '\\$&')
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset)
    if (!Number.isSafeInteger(offset) || offset < 0) throw error('Неверная страница')
    const users = db.prepare("SELECT id,name,email,role,at FROM users WHERE name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' ORDER BY id LIMIT 101 OFFSET ?").all(`%${q}%`, `%${q}%`, offset)
    res.json({ users: users.slice(0, 100), nextOffset: users.length > 100 ? offset + 100 : null })
  }))
  router.get('/audit', wrap((req, res) => {
    const rows = db.prepare('SELECT id,actor_id,target_id,old_role,new_role,at FROM role_audit ORDER BY id DESC LIMIT 200').all()
    res.json({ entries: rows })
  }))
  router.post('/users/:id/role', wrap((req, res) => {
    const origin = req.get('origin')
    if (!origin || origin !== `${req.protocol}://${req.get('host')}`) throw error('Неверный источник запроса', 403)
    const id = positiveId(req.params.id)
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length !== 1 || !roles.has(req.body.role)) throw error('Неверная роль')
    const result = db.transaction(() => {
      const actor = db.prepare('SELECT role FROM users WHERE id=?').get(req.user.id)
      if (!actor || actor.role !== 'admin') throw error('Доступ только администратору', 403)
      const target = db.prepare('SELECT id,role FROM users WHERE id=?').get(id)
      if (!target) throw error('Пользователь не найден', 404)
      if (target.role === req.body.role) return { id, role: target.role, changed: false }
      if (target.role === 'admin' && req.body.role !== 'admin' && db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get().n <= 1) throw error('Нельзя понизить последнего администратора', 409)
      db.prepare('UPDATE users SET role=? WHERE id=?').run(req.body.role, id)
      db.prepare('INSERT INTO role_audit(actor_id,target_id,old_role,new_role,at) VALUES(?,?,?,?,?)').run(req.user.id, id, target.role, req.body.role, Date.now())
      return { id, role: req.body.role, changed: true }
    }).immediate()
    res.json(result)
  }))
  router.use((err, _req, res, _next) => { if (!err.status) console.error(err); res.status(err.status || 500).json({ error: err.status ? err.message : 'Ошибка сервера' }) })
  return router
}
