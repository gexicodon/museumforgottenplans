#!/usr/bin/env node
/**
 * MCP-сервер «Музея несбывшихся планов»
 * Подключение в Claude Desktop / Cursor — см. README
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clusterLocal, sim, nameHall, combine, localCombo } from './ai.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = process.env.DB_PATH || path.join(root, 'data', 'museum-v3.db')
const db = new Database(DB_PATH)
const hasClaude = !!process.env.ANTHROPIC_API_KEY

const visible = () => db.prepare('SELECT id, title, text, cat FROM ideas WHERE hidden = 0').all()
const byId = (id) => db.prepare('SELECT id, title, text, cat FROM ideas WHERE hidden = 0 AND id = ?').get(Number(id))
const sequelsOf = (id) => db.prepare('SELECT text, at FROM sequels WHERE idea_id = ? ORDER BY at').all(Number(id))

const server = new McpServer({ name: 'museum-forgotten-plans', version: '1.0.0' })

server.tool(
  'list_ideas',
  'Список нереализованных идей музея. Можно фильтровать по категории.',
  {
    cat: z.string().optional().describe('Категория: Технологии, Искусство, Город, Наука, Бизнес, Путешествия, Быт'),
    limit: z.number().optional().describe('Максимум идей (по умолчанию 30)'),
  },
  async ({ cat, limit = 30 }) => {
    let ideas = visible()
    if (cat) ideas = ideas.filter((i) => i.cat === cat)
    return { content: [{ type: 'text', text: JSON.stringify(ideas.slice(0, limit), null, 2) }] }
  },
)

server.tool(
  'get_idea',
  'Одна идея и её продолжения (что люди уже сделали).',
  { id: z.number().describe('ID идеи') },
  async ({ id }) => {
    const idea = byId(id)
    if (!idea) return { content: [{ type: 'text', text: 'Идея не найдена' }], isError: true }
    return { content: [{ type: 'text', text: JSON.stringify({ ...idea, sequels: sequelsOf(id) }, null, 2) }] }
  },
)

server.tool(
  'find_similar',
  'Найти идеи, похожие на заданную (локальный cosine по токенам).',
  { id: z.number(), top_k: z.number().optional() },
  async ({ id, top_k = 5 }) => {
    const base = byId(id)
    if (!base) return { content: [{ type: 'text', text: 'Идея не найдена' }], isError: true }
    const scored = visible()
      .filter((i) => i.id !== id)
      .map((i) => ({ id: i.id, title: i.title, cat: i.cat, score: +sim(base, i).toFixed(3) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, top_k)
    return { content: [{ type: 'text', text: JSON.stringify(scored, null, 2) }] }
  },
)

server.tool(
  'list_halls',
  'Текущие залы сходств — кластеры похожих идей.',
  {},
  async () => {
    const halls = clusterLocal(visible()).map((g, i) => ({
      hall: i + 1,
      ideas: g.map(({ id, title, cat }) => ({ id, title, cat })),
    }))
    return { content: [{ type: 'text', text: JSON.stringify(halls, null, 2) }] }
  },
)

server.tool(
  'combine_ideas',
  'Неожиданное сочетание двух идей.',
  { id_a: z.number(), id_b: z.number() },
  async ({ id_a, id_b }) => {
    const a = byId(id_a), b = byId(id_b)
    if (!a || !b) return { content: [{ type: 'text', text: 'Идеи не найдены' }], isError: true }
    let result
    if (hasClaude) {
      try { result = await combine(a, b) } catch { result = localCombo(a, b) }
    } else result = localCombo(a, b)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

server.tool(
  'name_hall',
  'Назвать зал сходств и предложить, как объединить идеи в один проект.',
  { ids: z.array(z.number()).min(2).max(8) },
  async ({ ids }) => {
    const group = ids.map(byId).filter(Boolean)
    if (group.length < 2) return { content: [{ type: 'text', text: 'Нужно минимум 2 идеи' }], isError: true }
    if (!hasClaude) {
      return { content: [{ type: 'text', text: JSON.stringify({ title: 'Зал сходств', merge: 'Claude не подключён' }) }] }
    }
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await nameHall(group), null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text', text: 'Claude недоступен: ' + e.message }], isError: true }
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)