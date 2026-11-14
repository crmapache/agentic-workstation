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

/** «14:00». */
export const clockLabel = (ms: number): string => CLOCK.format(ms)

/** «Sun 20:00»: день недели и час - для срока в пределах недели. */
export const weekdayClockLabel = (ms: number): string => `${WEEKDAY.format(ms)} ${CLOCK.format(ms)}`

/** «Tue, Nov 10». */
export const weekdayDayLabel = (ms: number): string => WEEKDAY_DAY.format(ms)

/** Сколько календарных дней от from до to по местным полуночам (сегодня - 0, завтра - 1). */
export const daysBetween = (from: number, to: number): number => {
  const start = new Date(from)
  const end = new Date(to)

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  return Math.round((end.getTime() - start.getTime()) / DAY_MS)
}
