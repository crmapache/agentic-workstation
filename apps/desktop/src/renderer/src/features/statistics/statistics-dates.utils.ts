import type { StatsRange } from '@shared/statistics'

import { fullDayLabel, weekdayNames, weekdayDayLabel } from '../../lib/dates.utils'

/**
 * Даты статистики. Интерфейс английский - и даты по-английски, а не по языку системы: «Nov
 * 10» рядом с «Today», а не «10 нояб.». Часы, дни недели и день целиком - общие (lib/dates.utils).
 */

const LOCALE = 'en-US'

const DAY = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' })
const DATE = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric', year: 'numeric' })
const MONTH = new Intl.DateTimeFormat(LOCALE, { month: 'short' })

/** «Nov 10». */
export const dayLabel = (ms: number): string => DAY.format(ms)

/** «Nov 10, 2026» - начало данных: год нужен, история бывает долгой. */
export const dateLabel = (ms: number): string => DATE.format(ms)

/** «Nov». */
export const monthLabel = (ms: number): string => MONTH.format(ms)

/**
 * День в шапке вида: в этом году - без года («Nov 12», с днём недели - «Thu, Nov 12»), в
 * другом - с годом, иначе прошлый ноябрь не отличить от этого.
 */
export const pickedDayLabel = (ms: number, today: number, withWeekday: boolean): string => {
  const sameYear = new Date(ms).getFullYear() === new Date(today).getFullYear()

  if (withWeekday) return sameYear ? weekdayDayLabel(ms) : fullDayLabel(ms)

  return sameYear ? DAY.format(ms) : DATE.format(ms)
}

/** Дни недели отрезком по кругу (0 - понедельник, to - исключительно): «Tue-Thu». */
export const weekdayRangeLabel = (range: StatsRange): string => {
  const names = weekdayNames()
  const last = (range.to + 6) % 7

  return range.from === last
    ? (names[range.from] ?? '')
    : `${names[range.from] ?? ''}-${names[last] ?? ''}`
}

/** Часы отрезком по кругу (to - исключительно): «10:00-13:00», «22:00-01:00». */
export const hourRangeLabel = (range: StatsRange): string => {
  const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`

  return `${pad(range.from)}-${pad(range.to)}`
}
