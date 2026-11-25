import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import crypto from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const serverFile = fileURLToPath(new URL('../server/index.js', import.meta.url))
async function start(dbPath, ids = '') {
  const socket = net.createServer().listen(0, '127.0.0.1'); await once(socket, 'listening')
  const port = socket.address().port; await new Promise((resolve) => socket.close(resolve))
  const child = spawn(process.execPath, [serverFile], { env: { ...process.env, NODE_ENV: 'production', DB_PATH: dbPath, PORT: String(port), ADMIN_USER_IDS: ids, ANTHROPIC_API_KEY: '' }, stdio: 'ignore' })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Server failed')
    try { if ((await fetch(base + '/api/config')).ok) return { child, base } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  child.kill(); throw new Error('Server timeout')
}
async function stop(child) { if (child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done } }
async function request(base, method, url, body, cookie) {
  const headers = { 'content-type': 'application/json', origin: base }
  if (cookie) headers.cookie = cookie
  const response = await fetch(base + url, { method, headers, ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }) })
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
test('integrated demo: bootstrap, roles, idea, local Architect and MCP history', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'museum-integrated-test-'))
  const db = path.join(dir, 'test.db'), password = crypto.randomBytes(24).toString('hex')
  let app
  try {
    app = await start(db); let { base } = app
    assert.equal((await request(base, 'POST', '/api/architect', {})).status, 401)
    const admin = await request(base, 'POST', '/api/auth/register', { name: 'Demo Admin', email: 'demo-admin@example.test', password })
    const member = await request(base, 'POST', '/api/auth/register', { name: 'Demo Member', email: 'demo-member@example.test', password })
    assert.equal(admin.status, 201); assert.equal(member.status, 201); assert.equal(admin.data.user.admin, false)
    await stop(app.child); app = null
    app = await start(db, String(admin.data.user.id)); base = app.base
    assert.equal((await request(base, 'GET', '/api/admin/users', null, member.cookie)).status, 403)
    assert.equal((await request(base, 'GET', '/api/admin/users', null, admin.cookie)).status, 200)
    assert.equal((await request(base, 'POST', `/api/admin/users/${member.data.user.id}/role`, { role: 'moderator' }, admin.cookie)).status, 200)
    const idea = await request(base, 'POST', '/api/ideas', { title: 'Demo map', text: 'A small demo map for a local community.', cat: 'Город', anon: true }, member.cookie)
    assert.equal(idea.status, 201)
    const plan = await request(base, 'POST', '/api/architect', { ideaId: idea.data.id, skills: 'Python', hoursPerWeek: 5, budget: 0, outcome: 'Prototype' }, member.cookie)
    assert.equal(plan.status, 200); assert.equal(plan.data.mode, 'local'); assert.equal(plan.data.toolHistory.length, 5)
    assert.ok(plan.data.mvp.firstAction); assert.ok(plan.data.toolHistory.every((entry) => entry.status === 'success'))
  } finally {
    if (app) await stop(app.child)
    if (path.dirname(dir) === path.resolve(os.tmpdir()) && path.basename(dir).startsWith('museum-integrated-test-')) await rm(dir, { recursive: true, force: true })
  }
})
