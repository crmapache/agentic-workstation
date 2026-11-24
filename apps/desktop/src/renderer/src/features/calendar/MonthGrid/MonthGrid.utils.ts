import type { CalendarMeeting, CalendarOverlap } from '@shared/calendar-overlaps'

import { addDays, allDayOn } from '../calendar.utils'

/** Встречи дня для клетки месяца: на весь день - первыми, потом задевающие день по времени. */
export const meetingsOnDay = (
  meetings: readonly CalendarMeeting[],
  day: number,
): CalendarMeeting[] => {
  const next = addDays(day, 1)
  const timed = meetings
    .filter(({ event }) => !event.allDay && event.start < next && event.end > day)
    .sort((a, b) => a.event.start - b.event.start)

  return [...allDayOn(meetings, day), ...timed]
}

/**
 * Встречи в накладке: ключ → мягкая ли (одна из встреч под вопросом). Встреча хоть в одной
 * жёсткой накладке - жёсткая.
 */
export const clashingKeys = (overlaps: readonly CalendarOverlap[]): Map<string, boolean> => {
  const clashing = new Map<string, boolean>()

  for (const overlap of overlaps) {
    for (const key of [overlap.a, overlap.b]) {
      clashing.set(key, (clashing.get(key) ?? true) && overlap.soft)
    }
  }

  return clashing
}
