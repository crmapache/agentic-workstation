import type { Page } from './page'
import { callOn } from './page-nodes'

/**
 * Выражение модели (evaluate), которое само нажало, ввело или выбрало что-то на странице
 * (ADR 0049). Такое действие идёт мимо руки агента: курсора нет, поле меняется мгновенно,
 * человек, который смотрит на вкладку, ничего не видит, а сайт видит бота. Событие скрипта -
 * isTrusted false, от руки агента и от человека - true; по нему и считаем. Счёт идёт в окне
 * документа, где исполняется выражение, и только на время вызова.
 */

/** Чем скрипт действует на странице: el.click(), события ввода и выбора, отправка формы. */
const SCRIPTED_EVENTS = ['click', 'input', 'change', 'submit']

const KEY = 'agentic-workstation.scripted'

/** Окно документа элемента (this) или, без элемента, главного фрейма. */
const WINDOW = '(this && this.ownerDocument && this.ownerDocument.defaultView) || window'

/** Начать счёт; прежний незаконченный (вызов оборвался) - снять. */
const WATCH = `function () {
  const win = ${WINDOW}
  const key = Symbol.for('${KEY}')
  if (typeof win[key] === 'function') win[key]()
  const types = ${JSON.stringify(SCRIPTED_EVENTS)}
  let count = 0
  const note = (event) => { if (!event.isTrusted) count += 1 }
  for (const type of types) win.addEventListener(type, note, true)
  win[key] = () => {
    for (const type of types) win.removeEventListener(type, note, true)
    delete win[key]
    return count
  }
}`

/** Закончить счёт: сколько действий сделал скрипт. */
const UNWATCH = `function () {
  const stop = (${WINDOW})[Symbol.for('${KEY}')]
  return typeof stop === 'function' ? stop() : 0
}`

const run = async (page: Page, ref: string | undefined, fn: string): Promise<number> => {
  if (ref) return Number(await callOn<unknown>(page, ref, fn)) || 0

  const result = await page.cdp<{ result?: { value?: unknown } }>('Runtime.evaluate', {
    expression: `(${fn}).call(undefined)`,
    returnByValue: true,
  })

  return Number(result.result?.value) || 0
}

/**
 * Начать счёт; ответ - функция, которая его заканчивает и говорит, сколько действий сделал
 * скрипт. Не вышло (страница ушла посреди выражения, элемент пропал) - ноль: замечание модели -
 * подсказка, ответ выражения от него не зависит.
 */
export const watchScripted = async (page: Page, ref?: string): Promise<() => Promise<number>> => {
  await run(page, ref, WATCH).catch(() => 0)

  return () => run(page, ref, UNWATCH).catch(() => 0)
}

/** Что сказать модели, когда её выражение действовало на странице. */
export const SCRIPTED_NOTE =
  'Note: this script clicked, typed or changed fields on the page itself. The user watches your pointer in this tab and saw none of it, and sites take such changes for a bot. Act on the page with click, type, fill, select and press; use evaluate only to read.'
