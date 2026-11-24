import type { OverlapView } from '@shared/calendar-review'

import { startOfDay } from '../calendar.utils'
import { weekdayDayLabel } from '../../../lib/dates.utils'
import type { OverlapDay } from './OverlapsPanel.types'

/** Накладки по дням их начала, дни и накладки внутри - по времени. */
export const byDay = (overlaps: readonly OverlapView[]): OverlapDay[] => {
  const days = new Map<number, OverlapView[]>()

  for (const overlap of [...overlaps].sort((a, b) => a.start - b.start)) {
    const day = startOfDay(overlap.start)

    days.set(day, [...(days.get(day) ?? []), overlap])
  }

  return [...days.entries()].map(([day, list]) => ({
    day,
    label: weekdayDayLabel(day),
    overlaps: list,
  }))
}
