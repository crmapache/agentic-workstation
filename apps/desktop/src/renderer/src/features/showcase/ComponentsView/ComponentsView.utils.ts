import type { CalendarHeatmapDay } from '@agentic-workstation/ui/CalendarHeatmap.types'

import { weekdayDayLabel } from '../../../lib/dates.utils'

/** Недель в образце календаря - год, как у GitHub. */
const SAMPLE_WEEKS = 53

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short' })

/**
 * Год дней для образца календаря с понедельника 10 ноября 2025: число дня - минуты из
 * activity(номер дня), подписи - как у настоящего календаря статистики. Последняя неделя
 * не полная - «сегодня» вторник.
 */
export const calendarSample = (activity: (index: number) => number): CalendarHeatmapDay[] =>
  Array.from({ length: SAMPLE_WEEKS * 7 - 5 }, (_, index) => {
    const date = new Date(2025, 10, 10 + index)
    const value = activity(index)

    return {
      key: String(index),
      value,
      label: weekdayDayLabel(date.getTime()),
      valueLabel: `${value}m`,
      monthLabel: date.getDate() === 1 ? MONTH.format(date) : undefined,
    }
  })
