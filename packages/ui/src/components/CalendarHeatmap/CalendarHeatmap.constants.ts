import type { MarkSteps } from '../ChartTip/ChartTip.types'
import type { HeatLevel } from './CalendarHeatmap.types'

/** Дни идут по столбцам недель: вбок - неделя (семь дней), вверх и вниз - день. */
export const CALENDAR_STEPS: MarkSteps = { across: 7, down: 1 }

/** Ступени шкалы под календарём, от пустого дня к самому занятому. */
export const HEAT_LEVELS: readonly HeatLevel[] = [0, 1, 2, 3, 4]

/** Дней в неделе - строк календаря. */
export const WEEK_DAYS = 7
