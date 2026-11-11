export const CATS = ['Технологии', 'Искусство', 'Город', 'Наука', 'Бизнес', 'Путешествия', 'Быт']
async function call(method, url, body) {
  const init = { method }
  if (method !== 'GET') { init.headers = { 'content-type': 'application/json' }; init.body = JSON.stringify(body || {}) }
  const r = await fetch('/api' + url, init)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Ошибка ' + r.status)
  return d
}
export const api = {
  config: () => call('GET', '/config'),
  me: () => call('GET', '/auth/me'),
  login: (b) => call('POST', '/auth/login', b),
  register: (b) => call('POST', '/auth/register', b),
  logout: () => call('POST', '/auth/logout'),
  profile: () => call('GET', '/profile'),
  ideas: () => call('GET', '/ideas'),
  idea: (id) => call('GET', '/ideas/' + id),
  add: (b) => call('POST', '/ideas', b),
  del: (id) => call('DELETE', '/ideas/' + id),
  like: (id) => call('POST', `/ideas/${id}/like`),
  take: (id, b) => call('POST', `/ideas/${id}/sequels`, b),
  delSequel: (id) => call('DELETE', '/sequels/' + id),
  report: (id) => call('POST', `/ideas/${id}/report`),
  halls: () => call('GET', '/halls'),
  nameHall: (ids) => call('POST', '/halls/name', { ids }),
  pair: () => call('GET', '/pair'),
  combine: (a, b) => call('POST', '/combine', { a, b }),
}
