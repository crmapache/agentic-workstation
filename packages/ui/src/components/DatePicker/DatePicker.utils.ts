import { DAY_STEPS, WEEK_DAYS, GRID_WEEKS } from './DatePicker.constants'

/**
 * Дни календаря - местные полуночи в миллисекундах. Сдвиг - календарём, а не умножением:
 * сутки при переводе часов бывают по 23 и 25 часов.
 */

/** Местная полночь через days дней от day (отрицательное - назад). */
export const addDays = (day: number, days: number): number => {
  const date = new Date(day)

  date.setDate(date.getDate() + days)

  return date.getTime()
}

/** Первое число месяца, в котором лежит день. */
export const monthStartOf = (day: number): number => {
  const date = new Date(day)

  date.setHours(0, 0, 0, 0)
  date.setDate(1)

  return date.getTime()
}

/**
 * Тот же день месяца через months месяцев. Короткий месяц не перескакивает в следующий: 31
 * марта на месяц назад - 28 февраля, а не 3 марта.
 */
export const addMonths = (day: number, months: number): number => {
  const date = new Date(day)
  const dayOfMonth = date.getDate()

  date.setDate(1)
  date.setMonth(date.getMonth() + months)

  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()

  date.setDate(Math.min(dayOfMonth, lastDay))

  return date.getTime()
}

/** День недели с понедельника: 0 - понедельник, 6 - воскресенье. */
export const weekdayOf = (day: number): number => (new Date(day).getDay() + 6) % WEEK_DAYS

/** Сетка месяца: шесть недель с понедельника той недели, где первое число. */
export const monthGridOf = (monthStart: number): number[][] => {
  const first = addDays(monthStart, -weekdayOf(monthStart))

  return Array.from({ length: GRID_WEEKS }, (_, week) =>
    Array.from({ length: WEEK_DAYS }, (_, weekday) => addDays(first, week * WEEK_DAYS + weekday)),
  )
}

/** День в пределах min и max; край не задан - с той стороны без ограничения. */
export const clampDay = (day: number, min?: number, max?: number): number => {
  const low = min === undefined ? day : Math.max(min, day)

  return max === undefined ? low : Math.min(max, low)
}

/** Куда уходит курсор по клавише; null - клавиша не про курсор. */
export const movedDayOf = (day: number, key: string): number | null => {
  const step = DAY_STEPS[key]

  if (step !== undefined) return addDays(day, step)
  if (key === 'Home') return addDays(day, -weekdayOf(day))
  if (key === 'End') return addDays(day, WEEK_DAYS - 1 - weekdayOf(day))
  if (key === 'PageUp') return addMonths(day, -1)
  if (key === 'PageDown') return addMonths(day, 1)

  return null
}
