import { isAlwaysOn, nextClosing, nextOpening, isWorkingTime } from '@shared/queue-hours'
import type { QueueHours, ScenarioQueue } from '@shared/scenario-queues'

import { clockOfMinutes } from '../../lib/dates.utils'
import { waitingItems, runningItemOf } from './scenarios-queues.utils'

/**
 * Рабочие часы очереди на экране (ADR 0074): дни и окно словами, что часы сделают прямо сейчас
 * и почему очередь стоит вне них. Арифметика окна - общая с главным процессом
 * (`shared/queue-hours.ts`): окно говорит то же, что потом сделает очередь.
 */

/** Часы, с которыми открывается окно у очереди без них: будни, с 10 до 19. */
export const DEFAULT_HOURS: QueueHours = { from: 10 * 60, to: 19 * 60, days: [1, 2, 3, 4, 5] }

const WORK_DAYS: readonly number[] = [1, 2, 3, 4, 5]
const WEEKEND: readonly number[] = [6, 7]

/** Дни подряд от стольких - диапазоном «Mon-Thu», а не перечнем. */
const RANGE_FROM = 3

const sameDays = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && left.every((day, index) => day === right[index])

/** Дни словами: ключ i18n и перечень для ключа list. */
export type DaysWords = { key: 'everyDay' | 'weekdays' | 'weekend' | 'list'; days: string }

/** Дни по порядку (как их хранит очередь) словами: «Weekdays», «Mon-Thu, Sat». */
export const daysWords = (days: readonly number[], name: (day: number) => string): DaysWords => {
  if (days.length === 7) return { key: 'everyDay', days: '' }
  if (sameDays(days, WORK_DAYS)) return { key: 'weekdays', days: '' }
  if (sameDays(days, WEEKEND)) return { key: 'weekend', days: '' }

  const parts: string[] = []

  for (let start = 0; start < days.length;) {
    let end = start

    while (end + 1 < days.length && (days[end + 1] ?? 0) === (days[end] ?? 0) + 1) end += 1

    const run = days.slice(start, end + 1)

    if (run.length >= RANGE_FROM) parts.push(`${name(run[0] ?? 1)}-${name(run.at(-1) ?? 1)}`)
    else parts.push(...run.map(name))

    start = end + 1
  }

  return { key: 'list', days: parts.join(', ') }
}

/** Окно словами: «10:00-19:00»; null - сутки целиком (начало и конец совпали). */
export const spanLabel = (hours: QueueHours): string | null =>
  hours.from === hours.to ? null : `${clockOfMinutes(hours.from)}-${clockOfMinutes(hours.to)}`

/** Что часы сделают, если сохранить их сейчас. */
export type HoursNow =
  | { kind: 'noDays' }
  /** Окно идёт: очередь работает и уснёт в until. */
  | { kind: 'inside'; until: number }
  /** Окна нет: идущий прогон встанет сразу, очередь проснётся в until. */
  | { kind: 'outside'; until: number }
  /** Все дни по суткам: очередь не спит никогда. */
  | { kind: 'always' }

export const hoursNow = (hours: QueueHours, now: number): HoursNow => {
  if (hours.days.length === 0) return { kind: 'noDays' }
  if (isAlwaysOn(hours)) return { kind: 'always' }

  return isWorkingTime(hours, now)
    ? { kind: 'inside', until: nextClosing(hours, now) }
    : { kind: 'outside', until: nextOpening(hours, now) }
}

/** Почему спящая очередь стоит - строкой на её полосе. */
export type QueueRest =
  /**
   * Сценарий на паузе от часов: проснувшись, очередь снимет её сама, а оборванный ночью выходом
   * IDE - продолжит с места.
   */
  | { kind: 'paused'; name: string; until: number }
  /** Ждущий не стартует до утра; идущий (если есть) человек взял на себя. */
  | { kind: 'waiting'; until: number }

/** null - очередь не спит или спать ей не над чем: ничего не идёт и не ждёт. */
export const queueRest = (queue: ScenarioQueue): QueueRest | null => {
  const { nap } = queue
  const running = runningItemOf(queue)
  const napping = nap?.runId ? queue.items.find((item) => item.runId === nap.runId) : undefined

  if (!nap || queue.closedAt > 0) return null
  if (napping && (napping.state === 'running' || napping.state === 'stopped')) {
    return { kind: 'paused', name: napping.scenarioName, until: nap.until }
  }

  return running || waitingItems(queue).length > 0 ? { kind: 'waiting', until: nap.until } : null
}
