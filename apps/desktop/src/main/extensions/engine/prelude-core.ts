/**
 * Начало прелюдии песочницы расширения (ADR 0091): мост к IDE, журнал и таймеры. Это код на
 * JavaScript, который исполняется внутри QuickJS до модуля расширения: у песочницы нет ни
 * Node, ни DOM, всё наружу - через три функции хоста `__aw_host` (асинхронный вызов IDE JSON-ом),
 * `__aw_log` и `__aw_timer_*`. Колбэки расширения остаются внутри: наружу уходит только их номер,
 * IDE зовёт их через `__aw_dispatch`.
 */
export const PRELUDE_CORE = String.raw`
const awHost = globalThis.__aw_host
const awLog = globalThis.__aw_log
const awTimerSet = globalThis.__aw_timer_set
const awTimerClear = globalThis.__aw_timer_clear
delete globalThis.__aw_host
delete globalThis.__aw_log
delete globalThis.__aw_timer_set
delete globalThis.__aw_timer_clear

const handlers = new Map()
let nextHandler = 1

const describe = (error) => {
  if (error instanceof Error) return error.stack ? error.message + '\n' + error.stack : error.message
  try { return typeof error === 'string' ? error : JSON.stringify(error) } catch { return String(error) }
}

const keep = (fn, label) => {
  if (typeof fn !== 'function') throw new TypeError((label || 'handler') + ' must be a function')
  const id = nextHandler++
  handlers.set(id, fn)
  return id
}

const plain = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)))

const call = async (method, args) => {
  const raw = await awHost(method, JSON.stringify(args === undefined ? null : args))
  const answer = JSON.parse(raw)
  if (!answer.ok) throw new Error(answer.error)
  return answer.value
}

globalThis.__aw_dispatch = async (id, payload) => {
  const fn = handlers.get(id)
  if (!fn) return JSON.stringify({ ok: false, error: 'This handler is gone.' })
  try {
    const value = await fn(...JSON.parse(payload))
    return JSON.stringify({ ok: true, value: value === undefined ? null : value })
  } catch (error) {
    awLog('error', describe(error))
    return JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}

globalThis.__aw_forget = (id) => { handlers.delete(id) }

const format = (args) => args.map((value) => {
  if (typeof value === 'string') return value
  if (value instanceof Error) return describe(value)
  try { return JSON.stringify(value) } catch { return String(value) }
}).join(' ')

globalThis.console = Object.freeze({
  log: (...args) => awLog('log', format(args)),
  info: (...args) => awLog('info', format(args)),
  debug: (...args) => awLog('log', format(args)),
  warn: (...args) => awLog('warn', format(args)),
  error: (...args) => awLog('error', format(args)),
})

const timer = (repeat) => (fn, ms, ...args) => {
  const handler = keep(() => fn(...args), 'timer callback')
  return awTimerSet(handler, Number(ms) || 0, repeat)
}
globalThis.setTimeout = timer(false)
globalThis.setInterval = timer(true)
globalThis.clearTimeout = (id) => { if (id) awTimerClear(id) }
globalThis.clearInterval = globalThis.clearTimeout

/** Регистрация с колбэком: номер колбэка уходит в IDE, dispose снимает её там и здесь. */
const registered = async (method, spec, fn, label) => {
  const handler = keep(fn, label)
  try {
    await call(method, Object.assign({}, spec, { handler }))
  } catch (error) {
    handlers.delete(handler)
    throw error
  }
  return handler
}

const disposable = (handler, method, extra) => ({
  dispose: async () => {
    if (!handlers.has(handler)) return
    handlers.delete(handler)
    await call(method, Object.assign({ handler }, extra || {}))
  },
})
`
