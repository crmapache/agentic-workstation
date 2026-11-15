import type { StatsRange } from '@shared/statistics'
import { DAY_MS } from '@shared/time-units'

import { weekdayDayLabel } from '../../lib/dates.utils'

/**
 * Даты статистики. Интерфейс английский - и даты по-английски, а не по языку системы: «Nov
 * 10» рядом с «Today», а не «10 нояб.». Часы и день с днём недели - общие (lib/dates.utils).
 */

const LOCALE = 'en-US'

const DAY = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' })
const DATE = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric', year: 'numeric' })
const MONTH = new Intl.DateTimeFormat(LOCALE, { month: 'short' })
const WEEKDAY = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' })
const MONTH_YEAR = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' })
const WEEKDAY_DATE = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/** Понедельник, от которого считаются имена дней недели (9 ноября 2026 - понедельник). */
const A_MONDAY = new Date(2026, 10, 9).getTime()

/** «Nov 10». */
export const dayLabel = (ms: number): string => DAY.format(ms)

/** «Nov 10, 2026» - начало данных: год нужен, история бывает долгой. */
export const dateLabel = (ms: number): string => DATE.format(ms)

/** «Nov». */
export const monthLabel = (ms: number): string => MONTH.format(ms)

/** «November 2026» - месяц над календарём выбора дня. */
export const monthYearLabel = (ms: number): string => MONTH_YEAR.format(ms)

/** «Thu, Nov 12, 2026» - день целиком, для скринридера в календаре выбора. */
export const fullDayLabel = (ms: number): string => WEEKDAY_DATE.format(ms)

/**
 * День в шапке вида: в этом году - без года («Nov 12», с днём недели - «Thu, Nov 12»), в
 * другом - с годом, иначе прошлый ноябрь не отличить от этого.
 */
export const pickedDayLabel = (ms: number, today: number, withWeekday: boolean): string => {
  const sameYear = new Date(ms).getFullYear() === new Date(today).getFullYear()

  if (withWeekday) return sameYear ? weekdayDayLabel(ms) : WEEKDAY_DATE.format(ms)

  return sameYear ? DAY.format(ms) : DATE.format(ms)
}

/** Имена дней недели с понедельника: «Mon», «Tue»… */
export const weekdayNames = (): string[] =>
  Array.from({ length: 7 }, (_, index) => WEEKDAY.format(A_MONDAY + index * DAY_MS))

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
