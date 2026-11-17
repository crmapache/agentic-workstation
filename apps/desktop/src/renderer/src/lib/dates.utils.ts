/**
 * Часы и дни окна. Интерфейс английский - и даты по-английски, а не по языку системы: «Nov
 * 10» рядом с «Today», а не «10 нояб.». Часы - 24-часовые, как в панели.
 */

import { DAY_MS } from '@shared/time-units'

const LOCALE = 'en-US'

const CLOCK = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const WEEKDAY = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' })
const WEEKDAY_DAY = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})
const MONTH_YEAR = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' })
const WEEKDAY_DATE = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/** Понедельник, от которого считаются имена дней недели (9 ноября 2026 - понедельник). */
const A_MONDAY = new Date(2026, 10, 9).getTime()

/** «14:00». */
export const clockLabel = (ms: number): string => CLOCK.format(ms)

/** «Sun 20:00»: день недели и час - для срока в пределах недели. */
export const weekdayClockLabel = (ms: number): string => `${WEEKDAY.format(ms)} ${CLOCK.format(ms)}`

/** «Tue, Nov 10». */
export const weekdayDayLabel = (ms: number): string => WEEKDAY_DAY.format(ms)

/** «November 2026» - месяц над календарём выбора дня. */
export const monthYearLabel = (ms: number): string => MONTH_YEAR.format(ms)

/** «Thu, Nov 12, 2026» - день целиком, для скринридера в календаре выбора. */
export const fullDayLabel = (ms: number): string => WEEKDAY_DATE.format(ms)

/** Имена дней недели с понедельника: «Mon», «Tue»… */
export const weekdayNames = (): string[] =>
  Array.from({ length: 7 }, (_, index) => WEEKDAY.format(A_MONDAY + index * DAY_MS))

/** Слова для ближних дней: их даёт окно из i18n, дата - сама. */
export type NearDayWords = { today: string; tomorrow: string; yesterday: string }

/**
 * Момент словами для строки списка: «Today 09:00», «Tomorrow 09:00», в пределах недели -
 * «Mon 18:12», дальше - «Tue, Dec 1, 09:00».
 */
export const momentLabel = (ms: number, now: number, words: NearDayWords): string => {
  const days = daysBetween(now, ms)
  const clock = clockLabel(ms)

  if (days === 0) return `${words.today} ${clock}`
  if (days === 1) return `${words.tomorrow} ${clock}`
  if (days === -1) return `${words.yesterday} ${clock}`
  if (Math.abs(days) < 7) return weekdayClockLabel(ms)

  return `${weekdayDayLabel(ms)}, ${clock}`
}

/** Сколько календарных дней от from до to по местным полуночам (сегодня - 0, завтра - 1). */
export const daysBetween = (from: number, to: number): number => {
  const start = new Date(from)
  const end = new Date(to)

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  return Math.round((end.getTime() - start.getTime()) / DAY_MS)
}

const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * Сколько уже ждём - «0:42», «12:05», «1:02:03». Показание прибора, а не слова: строка, которая
 * на десятой и на девяностой секунде читается одинаково, неотличима от зависшей.
 */
export const waitClock = (ms: number): string => {
  const total = Math.floor(Math.max(0, ms) / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}
