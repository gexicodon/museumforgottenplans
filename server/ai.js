const STOP = new Set('и в во не что на с со как а то все так но да к у же вы за бы по от из до для мы их они это был была были есть или ни при над про без чем тоже уже еще только можно один раз когда если там тут'.split(' '))
const toks = (t) => t.toLowerCase().replace(/[^а-яёa-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 5))
const vec = (i) => { const m = new Map(); for (const w of toks(i.title + ' ' + i.text)) m.set(w, (m.get(w) || 0) + 1); return m }
const norm = (m) => Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0))

export function sim(a, b) {
  const A = vec(a), B = vec(b); let d = 0
  for (const [k, v] of A) d += v * (B.get(k) || 0)
  return d / (norm(A) * norm(B) || 1)
}

export function clusterLocal(ideas, threshold = 0.14) {
  const groups = []
  for (const idea of ideas) {
    let best = null, bs = 0
    for (const g of groups) {
      const s = g.reduce((t, x) => t + sim(idea, x), 0) / g.length
      if (s > bs) { bs = s; best = g }
    }
    if (best && bs >= threshold) best.push(idea); else groups.push([idea])
  }
  return groups.filter((g) => g.length > 1)
}

async function ask(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(30000),
  })
  if (!r.ok) throw new Error('Claude API ' + r.status)
  const d = await r.json()
  return JSON.parse(d.content.map((c) => c.text || '').join('').replace(/```json|```/g, '').trim())
}
const list = (g) => g.map((i) => `- ${i.title}: ${i.text}`).join('\n')

export const nameHall = (g) => ask(`Это похожие нереализованные идеи из музея несбывшихся планов:\n${list(g)}\nПридумай название зала (до 4 слов) и в одном-двух предложениях объясни, как объединить эти идеи в один проект. Только JSON: {"title":"","merge":""}`)
export const combine = (a, b) => ask(`Две нереализованные идеи:\n${list([a, b])}\nПридумай неожиданное сочетание, которое можно начать делать уже сейчас. Только JSON: {"title":"","pitch":"","first_step":""}`)
export const localCombo = (a, b) => ({
  title: `${a.title} × ${b.title}`,
  pitch: `Что если применить логику идеи «${a.title}» к области «${b.cat.toLowerCase()}» из идеи «${b.title}»? Каждая идея закроет слабое место другой.`,
  first_step: 'Проверьте на двух-трёх людях, какая часть сочетания вызывает интерес, и начните с неё.',
})

/** Агент-куратор: диагноз → план воскрешения → микро-эксперимент → сочетания */
export async function curatorAgent(idea, allIdeas, sequelsList = []) {
  const similar = allIdeas
    .filter((i) => i.id !== idea.id)
    .map((i) => ({ ...i, score: sim(idea, i) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)

  const seqText = sequelsList.length
    ? sequelsList.map((s) => s.text).join(' | ')
    : 'пока никто не забрал'

  const simText = similar.length
    ? similar.map((s) => `- [#${s.id}] ${s.title} (похожесть ${(s.score * 100).toFixed(0)}%): ${s.text.slice(0, 120)}`).join('\n')
    : 'похожих идей нет'

  return ask(`Ты куратор «Музея несбывшихся планов». Твоя задача — помочь воскресить заброшенную идею.

Идея #${idea.id}: «${idea.title}»
Текст: ${idea.text}
Категория: ${idea.cat}
Уже есть продолжения: ${seqText}
Похожие идеи в музее:
${simText}

Верни ТОЛЬКО JSON без markdown:
{
  "diagnosis": "почему идея могла застрять, 1-2 предложения",
  "revival_plan": ["конкретный шаг 1", "шаг 2", "шаг 3"],
  "micro_experiment": "что сделать за 1-2 часа, чтобы проверить интерес реальных людей",
  "risk": "главный риск и как его снизить",
  "suggested_combos": [{"with_id": 0, "title": "название сочетания", "why": "почему это сработает"}]
}
В suggested_combos используй id из списка похожих (или оставь пустой массив). Максимум 2 сочетания.`)
}