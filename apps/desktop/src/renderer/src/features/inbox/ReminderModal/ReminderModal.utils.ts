import { HOUR_MS } from '@shared/time-units'

/** Минуты по пять: напоминание - не секундомер. */
const STEP = 5

/** Через час, вверх до пяти минут: день (местная полночь) и минуты от полуночи. */
export const soonOf = (now: number): { day: number; at: number } => {
  const then = new Date(now + HOUR_MS)
  const minutes = Math.ceil((then.getHours() * 60 + then.getMinutes()) / STEP) * STEP
  const day = new Date(then.getFullYear(), then.getMonth(), then.getDate())

  // 23:58 → 24:00 - это полночь следующего дня.
  if (minutes >= 24 * 60)
    return { day: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime(), at: 0 }

  return { day: day.getTime(), at: minutes }
}

/** Момент из дня и минут от полуночи - местное время. */
export const momentOf = (day: number, at: number): number => {
  const moment = new Date(day)

  moment.setHours(Math.floor(at / 60), at % 60, 0, 0)

  return moment.getTime()
}

/** Полночь сегодняшнего дня - первый день, который можно выбрать. */
export const todayOf = (now: number): number => {
  const day = new Date(now)

  day.setHours(0, 0, 0, 0)

  return day.getTime()
}
