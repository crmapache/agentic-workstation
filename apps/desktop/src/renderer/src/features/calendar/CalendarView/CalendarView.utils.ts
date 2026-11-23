import type { CalendarMode, CalendarPeriod } from '../calendar.types'
import { fullDayLabel, monthDayLabel } from '../../../lib/dates.utils'

/** Подпись периода: неделя - «Nov 23 - Nov 29», день - «Tue, Nov 24, 2026». */
export const periodLabel = (mode: CalendarMode, period: CalendarPeriod): string =>
  mode === 'day'
    ? fullDayLabel(period.from)
    : `${monthDayLabel(period.from)} - ${monthDayLabel(period.to - 1)}`
