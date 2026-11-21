import type { RepeatPreset } from './tracker.types'

/** Как часто доска сверяет «сегодня»: «Today» на карточках сменится на «Yesterday» в полночь. */
export const DAY_TICK_MS = 60_000

/** Дни недели повтора: 1 - понедельник … 7 - воскресенье. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

/** Будни - правило «Every weekday». */
export const WORK_WEEK: readonly number[] = [1, 2, 3, 4, 5]

/** Готовые правила повтора в порядке меню. */
export const REPEAT_PRESETS: readonly RepeatPreset[] = [
  'daily',
  'weekdays',
  'weekly',
  'monthly',
  'yearly',
]
