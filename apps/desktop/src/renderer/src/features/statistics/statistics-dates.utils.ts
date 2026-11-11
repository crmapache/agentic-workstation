import type { StatsRange } from '@shared/statistics'
import { DAY_MS } from '@shared/time-units'

/**
 * Даты и часы статистики. Интерфейс английский - и даты по-английски, а не по языку
 * системы: «Nov 10» рядом с «Today», а не «10 нояб.». Часы - 24-часовые, как в панели.
 */

const LOCALE = 'en-US'

const CLOCK = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const DAY = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' })
const WEEKDAY_DAY = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})
const DATE = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric', year: 'numeric' })
const MONTH = new Intl.DateTimeFormat(LOCALE, { month: 'short' })
const WEEKDAY = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' })

/** Понедельник, от которого считаются имена дней недели (9 ноября 2026 - понедельник). */
const A_MONDAY = new Date(2026, 10, 9).getTime()

/** «14:00». */
export const clockLabel = (ms: number): string => CLOCK.format(ms)

/** «Nov 10». */
export const dayLabel = (ms: number): string => DAY.format(ms)

/** «Tue, Nov 10». */
export const weekdayDayLabel = (ms: number): string => WEEKDAY_DAY.format(ms)

/** «Nov 10, 2026» - начало данных: год нужен, история бывает долгой. */
export const dateLabel = (ms: number): string => DATE.format(ms)

/** «Nov». */
export const monthLabel = (ms: number): string => MONTH.format(ms)

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
