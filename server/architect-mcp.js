import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { pathToFileURL } from 'node:url'

const brief = {
  idea: z.object({ title: z.string().trim().min(1).max(100), text: z.string().trim().min(1).max(1500) }).strict(),
  skills: z.string().trim().min(1).max(500),
  hoursPerWeek: z.number().finite().min(1).max(168),
  budget: z.number().finite().min(0).max(100000000),
  outcome: z.string().trim().min(1).max(500),
}
export const briefSchema = z.object(brief).strict()
const text = z.string().min(1).max(4000)
const strings = z.array(text).max(30)
export const outputSchemas = {
  analyze_feasibility: z.object({ complexity: text, explanation: text, assumptions: strings, risks: strings, signals: z.object({ map: z.boolean(), audio: z.boolean(), payments: z.boolean(), ai: z.boolean() }).strict() }).strict(),
  suggest_tech_stack: z.object({ stack: z.array(z.object({ part: text, technology: text, reason: text }).strict()).max(20), budgetNote: text }).strict(),
  generate_mvp_plan: z.object({ goal: text, scenario: text, included: strings, excluded: strings, firstAction: text }).strict(),
  break_into_tasks: z.object({ stages: z.array(z.object({ name: text, tasks: strings, minHours: z.number().nonnegative(), maxHours: z.number().nonnegative() }).strict()).max(20) }).strict(),
  estimate_effort: z.object({ minHours: z.number().nonnegative(), maxHours: z.number().nonnegative(), minWeeks: z.number().nonnegative(), maxWeeks: z.number().nonnegative(), basis: text }).strict(),
}
const detect = (b) => {
  const s = `${b.idea.title} ${b.idea.text} ${b.outcome}`.toLowerCase()
  return { map: /карт[аыуе]|гео|map/.test(s), audio: /звук|аудио|audio/.test(s), payments: /оплат|плат[её]ж|payment/.test(s), ai: /ии|нейросет|искусственн|\bai\b/.test(s) }
}
const tools = {
  analyze_feasibility: {
    description: 'Оценить сложность, допущения и технические риски.',
    run(b) {
      const d = detect(b), factors = Object.values(d).filter(Boolean).length
      const complexity = factors >= 2 ? 'высокая' : factors ? 'средняя' : 'начальная или средняя'
      const risks = ['Требования могут оказаться шире первой версии: проверяйте один сценарий на пользователях.', 'Недостаток опыта или времени: оставьте запас и сократите объём MVP.']
      if (d.map) risks.push('Карты и геоданные: проверьте лицензию, стоимость и доступность источника.')
      if (d.audio) risks.push('Аудиофайлы: проверьте права, объём хранения и загрузку на мобильных устройствах.')
      if (d.payments) risks.push('Платежи требуют провайдера, защиты данных и проверки условий в вашей стране.')
      if (d.ai) risks.push('ИИ может ошибаться и требовать платного API; сначала проверьте локальную или ручную замену.')
      return { complexity, explanation: `Предварительная оценка: ${complexity}. Учтены признаки карты, аудио, платежей и ИИ; формулировку идеи нужно уточнить.`, assumptions: ['Один разработчик создаёт веб-прототип с одним основным сценарием.', 'Часы и бюджет относятся к доступным ресурсам; стоимость хостинга и внешних сервисов нужно проверить отдельно.'], risks, signals: d }
    },
  },
  suggest_tech_stack: {
    description: 'Подобрать стек с учётом навыков и признаков проекта.',
    run(b) {
      const d = detect(b), python = /python|питон/i.test(b.skills), js = /javascript|typescript|react|js|реакт/i.test(b.skills)
      const stack = [{ part: 'Интерфейс', technology: js ? 'React + Vite' : 'HTML, CSS и JavaScript', reason: js ? 'Опирается на указанные навыки.' : 'Подойдёт для небольшого браузерного прототипа.' }, { part: 'Сервер', technology: python && !js ? 'Python + Flask' : 'Node.js + Express', reason: python && !js ? 'Использует указанный Python.' : 'Один язык для интерфейса и сервера.' }, { part: 'Данные', technology: 'SQLite', reason: 'Локальная база без отдельного сервера для прототипа.' }]
      if (d.map) stack.push({ part: 'Карта', technology: 'Leaflet + источник карт с подходящей лицензией', reason: 'Подходит для интерактивной карты; условия источника надо проверить.' })
      if (d.audio) stack.push({ part: 'Аудио', technology: 'HTML audio и локальные тестовые файлы', reason: 'Позволяет проверить воспроизведение без платного сервиса.' })
      return { stack, budgetNote: b.budget === 0 ? 'Для первого прототипа используйте локальные инструменты; публичное размещение может иметь ограничения.' : 'Бюджет указан пользователем; сравните актуальные цены размещения и сервисов до покупки.' }
    },
  },
  generate_mvp_plan: {
    description: 'Определить минимальный сценарий и границы первой версии.',
    run(b) { return { goal: `Проверить результат: ${b.outcome}`, scenario: `Пользователь открывает прототип «${b.idea.title}» и выполняет один основной сценарий, который нужно уточнить на примере.`, included: ['Один основной экран и один проверяемый сценарий', 'Небольшой набор тестовых данных', 'Обратная связь от 2–3 потенциальных пользователей'], excluded: ['Масштабирование, сложные интеграции и автоматизация до проверки спроса'], firstAction: `Запишите на одной странице, кто будет пользоваться «${b.idea.title}», и один конкретный результат для этого человека.` } },
  },
  break_into_tasks: {
    description: 'Разбить MVP на этапы с задачами и диапазонами часов.',
    run(b) {
      const d = detect(b), stages = [
        { name: 'Уточнение', tasks: ['Описать пользователя и один сценарий', 'Нарисовать простой экран'], minHours: 3, maxHours: 6 },
        { name: 'Прототип', tasks: ['Создать экран и запустить проект локально', 'Добавить основной сценарий и тестовые данные'], minHours: 10, maxHours: 20 },
        { name: 'Проверка', tasks: ['Проверить сценарий на разных размерах экрана', 'Показать прототип 2–3 людям и записать замечания'], minHours: 4, maxHours: 8 },
      ]
      if (d.map || d.audio || d.payments || d.ai) stages.splice(2, 0, { name: 'Проверка интеграции', tasks: ['Проверить доступность и условия нужного сервиса', 'Добавить минимальную интеграцию или ручную замену'], minHours: 4, maxHours: 12 })
      return { stages }
    },
  },
  estimate_effort: {
    description: 'Посчитать диапазон трудозатрат и календарного времени по этапам.',
    run(b) {
      const stages = tools.break_into_tasks.run(b).stages, minHours = stages.reduce((n, s) => n + s.minHours, 0), maxHours = stages.reduce((n, s) => n + s.maxHours, 0)
      return { minHours, maxHours, minWeeks: +(minHours / b.hoursPerWeek).toFixed(1), maxWeeks: +(maxHours / b.hoursPerWeek).toFixed(1), basis: 'Сумма диапазонов этапов для одного человека; без гарантии, без учёта длительного обучения и внешних согласований.' }
    },
  },
}
export function createArchitectServer() {
  const server = new McpServer({ name: 'museum-project-architect', version: '1.0.0' })
  for (const [name, tool] of Object.entries(tools)) server.tool(name, tool.description, brief, async (args) => {
    const data = outputSchemas[name].parse(tool.run(briefSchema.parse(args)))
    return { content: [{ type: 'text', text: JSON.stringify(data) }] }
  })
  return server
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await createArchitectServer().connect(new StdioServerTransport())
