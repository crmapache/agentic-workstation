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
const MONTH_DAY = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' })
const ORDINAL = new Intl.PluralRules(LOCALE, { type: 'ordinal' })
const ORDINAL_SUFFIX: Record<Intl.LDMLPluralRule, string> = {
  zero: 'th',
  one: 'st',
  two: 'nd',
  few: 'rd',
  many: 'th',
  other: 'th',
}
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

/** «Nov 21» - день года без дня недели: годовой повтор карточки. */
export const monthDayLabel = (ms: number): string => MONTH_DAY.format(ms)

/** «1st», «22nd», «31st» - число месяца словом: месячный повтор карточки. */
export const ordinalLabel = (value: number): string =>
  `${value}${ORDINAL_SUFFIX[ORDINAL.select(value)]}`

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
 * День словами: «Today», «Tomorrow», «Yesterday», в пределах недели - «Mon», дальше -
 * «Tue, Dec 1». Основа и момента в строке списка, и срока карточки трекера.
 */
export const nearDayLabel = (ms: number, now: number, words: NearDayWords): string => {
  const days = daysBetween(now, ms)

  if (days === 0) return words.today
  if (days === 1) return words.tomorrow
  if (days === -1) return words.yesterday

  return Math.abs(days) < 7 ? WEEKDAY.format(ms) : weekdayDayLabel(ms)
}

/**
 * Момент словами для строки списка: «Today 09:00», «Tomorrow 09:00», в пределах недели -
 * «Mon 18:12», дальше - «Tue, Dec 1, 09:00» (дата с запятой внутри - и час через запятую).
 */
export const momentLabel = (ms: number, now: number, words: NearDayWords): string => {
  const separator = Math.abs(daysBetween(now, ms)) < 7 ? ' ' : ', '

  return `${nearDayLabel(ms, now, words)}${separator}${clockLabel(ms)}`
}

/** Сколько календарных дней от from до to по местным полуночам (сегодня - 0, завтра - 1). */
export const daysBetween = (from: number, to: number): number => {
  const start = new Date(from)
  const end = new Date(to)

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  return Math.round((end.getTime() - start.getTime()) / DAY_MS)
}

/** Число в две цифры: «09». */
export const pad2 = (value: number): string => String(value).padStart(2, '0')

/** `YYYY-MM-DD` местного дня момента: так день хранят срок, разовый запуск и ключ дня. */
export const isoDay = (ms: number): string => {
  const date = new Date(ms)

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** «08:30» из минут от полуночи; вне суток - к ближнему краю, а не «24:00». */
export const clockOfMinutes = (minutes: number): string => {
  const safe = Math.min(Math.max(Math.round(minutes), 0), 24 * 60 - 1)

  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`
}

/**
 * Сколько уже ждём - «0:42», «12:05», «1:02:03». Показание прибора, а не слова: строка, которая
 * на десятой и на девяностой секунде читается одинаково, неотличима от зависшей.
 */
export const waitClock = (ms: number): string => {
  const total = Math.floor(Math.max(0, ms) / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${minutes}:${pad2(seconds)}`
}
