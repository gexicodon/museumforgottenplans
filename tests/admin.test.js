import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const serverFile = fileURLToPath(new URL('../server/index.js', import.meta.url))
async function start(dbPath, ids = '') {
  const socket = net.createServer().listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  const child = spawn(process.execPath, [serverFile], { env: { ...process.env, PORT: String(port), DB_PATH: dbPath, ADMIN_USER_IDS: ids, ANTHROPIC_API_KEY: '', NODE_ENV: 'production' }, stdio: ['ignore', 'ignore', 'inherit'] })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Server failed to start')
    try { if ((await fetch(base + '/api/config')).ok) return { child, base } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  child.kill(); throw new Error('Server startup timed out')
}
async function stop(child) { if (child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done } }
async function request(base, method, url, sid, body, origin = base) {
  const headers = { 'content-type': 'application/json' }
  if (sid) headers.cookie = `sid=${sid}`
  if (origin) headers.origin = origin
  const response = await fetch(base + url, { method, headers, ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }) })
  return { status: response.status, body: await response.json() }
}

test('legacy migration, role isolation, audit and last administrator', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'museum-admin-test-'))
  const dbPath = path.join(dir, 'test.db'), tokens = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)]
  const db = new Database(dbPath)
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT UNIQUE COLLATE NOCASE NOT NULL,email TEXT UNIQUE COLLATE NOCASE NOT NULL,pass TEXT NOT NULL,at INTEGER NOT NULL);
    CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,exp INTEGER NOT NULL);
    CREATE TABLE ideas(id INTEGER PRIMARY KEY,title TEXT NOT NULL,text TEXT NOT NULL,cat TEXT NOT NULL,user_id INTEGER,anon INTEGER DEFAULT 1,at INTEGER NOT NULL,hidden INTEGER DEFAULT 0);`)
  for (let i = 0; i < 3; i++) {
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(i + 1, `Test ${i}`, `test${i}@example.test`, 'synthetic-hash', 1)
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(crypto.createHash('sha256').update(tokens[i]).digest('hex'), i + 1, Date.now() + 600000)
  }
  db.prepare('INSERT INTO ideas(id,title,text,cat,user_id,at) VALUES(1,?,?,?,?,?)').run('Idea', 'Existing synthetic idea', 'Город', 1, 1)
  db.close()
  let instance
  try {
    instance = await start(dbPath, '1')
    let { base } = instance
    for (const [method, url] of [['GET','/api/admin/users'], ['GET','/api/admin/audit'], ['POST','/api/admin/users/2/role']]) {
      assert.equal((await request(base, method, url, null, { role: 'admin' })).status, 401)
      assert.equal((await request(base, method, url, tokens[1], { role: 'admin' })).status, 403)
    }
    assert.equal((await request(base, 'GET', '/api/auth/me', tokens[0])).body.user.role, 'admin')
    assert.equal((await request(base, 'GET', '/api/auth/me', tokens[1])).body.user.role, 'user')
    assert.equal((await request(base, 'GET', '/api/ideas/1')).body.title, 'Idea')
    const users = await request(base, 'GET', '/api/admin/users?q=Test', tokens[0])
    assert.equal(users.status, 200); assert.equal(users.body.users.length, 3)
    assert.ok(users.body.users.every((u) => !('pass' in u) && !('sid' in u)))
    assert.equal((await request(base, 'POST', '/api/admin/users/2/role', tokens[0], { role: 'moderator' }, 'https://evil.example')).status, 403)
    assert.equal((await request(base, 'POST', '/api/admin/users/2/role', tokens[0], { role: 'moderator' })).status, 200)
    assert.equal((await request(base, 'POST', '/api/admin/users/2/role', tokens[1], { role: 'admin' })).status, 403)
    assert.equal((await request(base, 'GET', '/api/admin/audit', tokens[1])).status, 403)
    for (const [url, role] of [['/api/admin/users/0/role','admin'], ['/api/admin/users/1.5/role','admin'], ['/api/admin/users/2/role','root']]) assert.equal((await request(base, 'POST', url, tokens[0], { role })).status, 400)
    assert.equal((await request(base, 'POST', '/api/admin/users/1/role', tokens[0], { role: 'user' })).status, 409)
    assert.equal((await request(base, 'POST', '/api/admin/users/3/role', tokens[0], { role: 'admin' })).status, 200)
    assert.equal((await request(base, 'POST', '/api/admin/users/2/role', tokens[0], { role: 'user' })).status, 200)
    assert.equal((await request(base, 'POST', '/api/admin/users/1/role', tokens[2], { role: 'user' })).status, 200)
    assert.equal((await request(base, 'POST', '/api/admin/users/3/role', tokens[2], { role: 'moderator' })).status, 409)
    const audit = await request(base, 'GET', '/api/admin/audit', tokens[2])
    assert.equal(audit.status, 200); assert.equal(audit.body.entries.length, 5)
    assert.deepEqual(Object.keys(audit.body.entries[0]).sort(), ['actor_id','at','id','new_role','old_role','target_id'])
    await stop(instance.child); instance = null
    instance = await start(dbPath, '1'); base = instance.base
    assert.equal((await request(base, 'GET', '/api/auth/me', tokens[2])).body.user.role, 'admin')
    assert.equal((await request(base, 'GET', '/api/auth/me', tokens[0])).body.user.role, 'user')
    const verify = new Database(dbPath, { readonly: true })
    assert.equal(verify.prepare('SELECT COUNT(*) n FROM users').get().n, 3)
    assert.equal(verify.prepare('SELECT COUNT(*) n FROM sessions').get().n, 3)
    assert.equal(verify.prepare('SELECT COUNT(*) n FROM ideas').get().n, 1)
    assert.equal(verify.prepare('SELECT pass FROM users WHERE id=1').get().pass, 'synthetic-hash')
    verify.close()
    await stop(instance.child); instance = null
    const manipulated = new Database(dbPath)
    manipulated.prepare("UPDATE users SET role='user' WHERE id=3").run()
    manipulated.close()
    instance = await start(dbPath, '1'); base = instance.base
    assert.equal((await request(base, 'GET', '/api/auth/me', tokens[0])).body.user.role, 'user', 'completed bootstrap cannot silently restore revoked rights')
    assert.equal((await request(base, 'GET', '/api/auth/me', tokens[2])).body.user.role, 'user')
  } finally {
    if (instance) await stop(instance.child)
    if (path.dirname(dir) === path.resolve(os.tmpdir()) && path.basename(dir).startsWith('museum-admin-test-')) await rm(dir, { recursive: true, force: true })
  }
})
