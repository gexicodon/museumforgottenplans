import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const serverFile = fileURLToPath(new URL('../server/index.js', import.meta.url))
async function freePort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}
async function start(dbPath, adminIds = '') {
  const port = await freePort()
  const child = spawn(process.execPath, [serverFile], { env: { ...process.env, NODE_ENV: 'production', PORT: String(port), DB_PATH: dbPath, ADMIN_EMAIL: 'admin@example.test', ADMIN_USER_IDS: adminIds, ANTHROPIC_API_KEY: '' }, stdio: 'ignore' })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Test server exited: ${child.exitCode}`)
    try { if ((await fetch(base + '/api/config')).ok) return { child, base } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  child.kill()
  throw new Error('Test server did not start')
}
async function stop(child) {
  if (child.exitCode !== null) return
  const ended = once(child, 'exit')
  child.kill()
  await ended
}
async function request(base, method, url, body, cookie) {
  const headers = { 'content-type': 'application/json' }
  if (cookie) headers.cookie = cookie
  const response = await fetch(base + url, { method, headers, ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}) })
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
}

test('authorization and moderator privileges use isolated database', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'museum-auth-test-'))
  const dbPath = path.join(dir, 'test.db')
  let instance
  try {
    instance = await start(dbPath)
    let { base } = instance
    const before = (await request(base, 'GET', '/api/ideas')).data
    const routes = [
      ['GET', '/api/profile'], ['POST', '/api/ideas', {}], ['DELETE', '/api/ideas/1'],
      ['POST', '/api/ideas/1/like'], ['POST', '/api/ideas/1/sequels'], ['DELETE', '/api/sequels/1'],
      ['POST', '/api/ideas/1/report'], ['POST', '/api/halls/name'], ['POST', '/api/combine'],
      ['POST', '/api/ideas/1/curate'],
    ]
    for (const [method, url, body] of routes) {
      const response = await request(base, method, url, body)
      assert.equal(response.status, 401, `${method} ${url}`)
    }
    assert.deepEqual((await request(base, 'GET', '/api/ideas')).data, before, 'anonymous requests must not change ideas, likes or sequels')
    const admin = await request(base, 'POST', '/api/auth/register', { name: 'Admin Candidate', email: 'admin@example.test', password: 'password123' })
    assert.equal(admin.status, 201)
    assert.equal(admin.data.user.admin, false, 'ADMIN_EMAIL must not confer privileges')
    const owner = await request(base, 'POST', '/api/auth/register', { name: 'Owner', email: 'owner@example.test', password: 'password123' })
    const other = await request(base, 'POST', '/api/auth/register', { name: 'Other', email: 'other@example.test', password: 'password123' })
    assert.equal(owner.status, 201); assert.equal(other.status, 201)
    const login = await request(base, 'POST', '/api/auth/login', { email: 'owner@example.test', password: 'password123' })
    assert.equal(login.status, 200)
    const badLogin = await request(base, 'POST', '/api/auth/login', { email: 'owner@example.test', password: 'wrong-password' })
    assert.equal(badLogin.status, 401); assert.equal(typeof badLogin.data.error, 'string')
    const idea = await request(base, 'POST', '/api/ideas', { title: 'Test idea', text: 'An isolated test idea with enough detail.', cat: 'Город', anon: false }, login.cookie)
    assert.equal(idea.status, 201)
    const id = idea.data.id
    assert.equal((await request(base, 'POST', `/api/ideas/${id}/like`, {}, login.cookie)).status, 200)
    assert.equal((await request(base, 'POST', `/api/ideas/${id}/report`, {}, other.cookie)).status, 200)
    assert.equal((await request(base, 'POST', `/api/ideas/${id}/sequels`, { text: 'This is a test sequel.', anon: true }, login.cookie)).status, 201)
    const ideaView = await request(base, 'GET', `/api/ideas/${id}`)
    const sequelId = ideaView.data.sequels[0].id
    assert.equal((await request(base, 'DELETE', `/api/ideas/${id}`, {}, other.cookie)).status, 403)
    assert.equal((await request(base, 'DELETE', `/api/sequels/${sequelId}`, {}, other.cookie)).status, 403)
    assert.equal((await request(base, 'DELETE', `/api/ideas/${id}`, {}, admin.cookie)).status, 403)
    const otherProfile = await request(base, 'GET', '/api/profile', null, other.cookie)
    assert.equal(otherProfile.status, 200)
    assert.equal(otherProfile.data.ideas.some((item) => item.id === id), false)
    assert.equal((await request(base, 'POST', '/api/combine', { a: 1, b: 2 }, login.cookie)).status, 200)
    assert.equal((await request(base, 'POST', '/api/halls/name', { ids: [1, 2] }, login.cookie)).status, 503)
    assert.equal((await request(base, 'POST', '/api/ideas/1/curate', {}, login.cookie)).status, 503)
    await stop(instance.child); instance = null
    for (const badIds of ['999999', '1,not-an-id', '-1']) {
      const invalid = spawn(process.execPath, [serverFile], { env: { ...process.env, NODE_ENV: 'production', PORT: String(await freePort()), DB_PATH: dbPath, ADMIN_USER_IDS: badIds, ANTHROPIC_API_KEY: '' }, stdio: 'ignore' })
      assert.notEqual((await once(invalid, 'exit'))[0], 0, `invalid moderator setting ${badIds} must prevent startup`)
    }
    instance = await start(dbPath, String(admin.data.user.id)); base = instance.base
    const adminLogin = await request(base, 'POST', '/api/auth/login', { email: 'admin@example.test', password: 'password123' })
    assert.equal(adminLogin.data.user.admin, true)
    assert.equal((await request(base, 'GET', '/api/auth/me', null, adminLogin.cookie)).data.user.admin, true)
    assert.equal((await request(base, 'DELETE', `/api/sequels/${sequelId}`, {}, adminLogin.cookie)).status, 200)
    assert.equal((await request(base, 'DELETE', `/api/ideas/${id}`, {}, adminLogin.cookie)).status, 200)
    await stop(instance.child); instance = null
    instance = await start(dbPath); base = instance.base
    const removed = await request(base, 'POST', '/api/auth/login', { email: 'admin@example.test', password: 'password123' })
    assert.equal(removed.data.user.admin, false, 'removing ID revokes access')
  } finally {
    if (instance) await stop(instance.child)
    if (path.dirname(dir) === path.resolve(os.tmpdir()) && path.basename(dir).startsWith('museum-auth-test-')) await rm(dir, { recursive: true, force: true })
  }
})
