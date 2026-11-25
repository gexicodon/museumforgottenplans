import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createArchitectServer } from '../server/architect-mcp.js'
import { architectAgent } from '../server/architect-agent.js'

const brief = { idea: { title: 'Карта звуков', text: 'Карта записей звуков исчезающих мест' }, skills: 'Python', hoursPerWeek: 5, budget: 0, outcome: 'Послушать записи на карте' }
test('MCP exposes distinct validated tools and returns structured JSON', async () => {
  const server = createArchitectServer(), client = new Client({ name: 'test', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  try {
    await Promise.all([server.connect(b), client.connect(a)])
    const names = (await client.listTools()).tools.map((t) => t.name)
    assert.deepEqual(new Set(names), new Set(['analyze_feasibility', 'suggest_tech_stack', 'break_into_tasks', 'estimate_effort', 'generate_mvp_plan']))
    for (const name of names) {
      const r = await client.callTool({ name, arguments: brief })
      assert.ok(!r.isError, name)
      assert.ok(JSON.parse(r.content[0].text), name)
    }
    const invalid = await client.callTool({ name: 'estimate_effort', arguments: { ...brief, hoursPerWeek: 0 } })
    assert.equal(invalid.isError, true)
  } finally { await client.close(); await server.close() }
})
test('agent uses tool results, respects resources and rejects invalid briefs', async () => {
  const r = await architectAgent(brief)
  assert.equal(r.toolsUsed.length, 5)
  assert.equal(r.feasibility.signals.map, true)
  assert.equal(r.feasibility.signals.audio, true)
  assert.match(JSON.stringify(r.technology.stack), /Flask/)
  assert.equal(r.effort.minHours, r.tasks.stages.reduce((n, s) => n + s.minHours, 0))
  assert.equal(r.effort.maxWeeks, r.effort.maxHours / 5)
  await assert.rejects(architectAgent({ ...brief, budget: -1 }))
})
