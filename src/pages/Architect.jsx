import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { useApp, useIdeas } from '../components.jsx'

export default function Architect() {
  const { user } = useApp(), [ideas] = useIdeas(), [query] = useSearchParams()
  const [form, setForm] = useState({ ideaId: query.get('idea') || '', skills: '', hoursPerWeek: '', budget: '', outcome: '' })
  const [result, setResult] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const change = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setResult(null)
    try { setResult(await api.architect({ ...form, ideaId: Number(form.ideaId), hoursPerWeek: Number(form.hoursPerWeek), budget: Number(form.budget) })) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <div className="page narrow">
    <h1 className="h">AI Project Architect</h1>
    <p className="lead sm">Превратите экспонат в первый технический план. При наличии настроенной модели инструменты выбирает ИИ; иначе используется локальная оценка по правилам.</p>
    {!user ? <p><Link to="/login" state={{ from: '/architect' }}>Войдите</Link>, чтобы составить план.</p> : <form className="form" onSubmit={submit}>
      <label>Идея<select required value={form.ideaId} onChange={change('ideaId')}><option value="">Выберите экспонат</option>{ideas?.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</select></label>
      <label>Технические навыки<textarea required maxLength={500} rows={3} value={form.skills} onChange={change('skills')} placeholder="Например: начинаю изучать Python" /></label>
      <label>Часов в неделю<input required type="number" min="1" max="168" step="any" value={form.hoursPerWeek} onChange={change('hoursPerWeek')} /></label>
      <label>Бюджет, ₽<input required type="number" min="0" max="100000000" step="any" value={form.budget} onChange={change('budget')} /></label>
      <label>Желаемый результат<textarea required maxLength={500} rows={3} value={form.outcome} onChange={change('outcome')} placeholder="Что должен уметь первый результат?" /></label>
      <button className="btn" disabled={busy || !ideas?.length}>{busy ? 'Составляю план…' : 'Составить план'}</button>
      {error && <p role="alert">{error}</p>}
    </form>}
    {result && <section className="card lit architect-result" aria-live="polite">
      <h2>План: {result.idea.title}</h2><p>{result.notice}</p>
      <h3>История вызовов MCP</h3><ol>{result.toolHistory.map((item, i) => <li key={i}>{item.name} — {item.source === 'llm' ? 'выбран моделью' : 'локальный режим'}; {item.status === 'success' ? 'выполнен' : 'ошибка'}</li>)}</ol>
      <h3>Реализуемость: {result.feasibility.complexity}</h3><p>{result.feasibility.explanation}</p>
      <h3>Допущения</h3><ul>{result.feasibility.assumptions.map((x) => <li key={x}>{x}</li>)}</ul>
      <h3>Технологии</h3><ul>{result.technology.stack.map((x) => <li key={x.part}><b>{x.part}: {x.technology}.</b> {x.reason}</li>)}</ul><p>{result.technology.budgetNote}</p>
      <h3>Первая версия (MVP)</h3><p>{result.mvp.goal}</p><p>{result.mvp.scenario}</p><ul>{result.mvp.included.map((x) => <li key={x}>{x}</li>)}</ul><p>Пока за рамками: {result.mvp.excluded.join(', ')}</p>
      <h3>Этапы и задачи</h3>{result.tasks.stages.map((stage) => <div key={stage.name}><b>{stage.name}: {stage.minHours}–{stage.maxHours} ч</b><ul>{stage.tasks.map((x) => <li key={x}>{x}</li>)}</ul></div>)}
      <h3>Трудозатраты</h3><p>{result.effort.minHours}–{result.effort.maxHours} часов, примерно {result.effort.minWeeks}–{result.effort.maxWeeks} недель. {result.effort.basis}</p>
      <h3>Риски</h3><ul>{result.feasibility.risks.map((x) => <li key={x}>{x}</li>)}</ul>
      <h3>Первое действие</h3><p>{result.mvp.firstAction}</p>
    </section>}
  </div>
}
