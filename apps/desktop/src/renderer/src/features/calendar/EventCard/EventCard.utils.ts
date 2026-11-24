import type { CalendarEvent } from '@shared/calendar'
import type { CalendarMeeting, CalendarOverlap } from '@shared/calendar-overlaps'
import { DAY_MS, MINUTE_MS } from '@shared/time-units'

import { clockLabel, weekdayDayLabel } from '../../../lib/dates.utils'
import type { Clash } from './EventCard.types'

/** Местная полночь даты «2026-11-24». */
const dayOf = (date: string): number => {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)

  return new Date(year, month - 1, day).getTime()
}

/** Когда встреча: «Tue, Nov 24, 10:00 - 11:00», весь день - днём или днями (конец включён). */
export const whenLabel = (event: CalendarEvent): string => {
  if (event.allDay) {
    const first = dayOf(event.allDay.from)
    const last = dayOf(event.allDay.to) - 1

    return last - first < DAY_MS
      ? weekdayDayLabel(first)
      : `${weekdayDayLabel(first)} - ${weekdayDayLabel(last)}`
  }

  const sameDay = new Date(event.start).toDateString() === new Date(event.end - 1).toDateString()

  return sameDay
    ? `${weekdayDayLabel(event.start)}, ${clockLabel(event.start)} - ${clockLabel(event.end)}`
    : `${weekdayDayLabel(event.start)}, ${clockLabel(event.start)} - ${weekdayDayLabel(event.end)}, ${clockLabel(event.end)}`
}

/** Длительность: «30 min», «1 h», «1 h 30 min». */
export const durationLabel = (ms: number): string => {
  const minutes = Math.round(ms / MINUTE_MS)
  const rest = minutes % 60

  if (minutes < 60) return `${minutes} min`

  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${minutes / 60} h`
}

/** С какими встречами эта накладывается: накладка и другая встреча. */
export const clashesOf = (
  meeting: CalendarMeeting,
  meetings: readonly CalendarMeeting[],
  overlaps: readonly CalendarOverlap[],
): Clash[] =>
  overlaps.flatMap((overlap) => {
    if (overlap.a !== meeting.key && overlap.b !== meeting.key) return []

    const other = meetings.find(
      (one) => one.key === (overlap.a === meeting.key ? overlap.b : overlap.a),
    )

    return other ? [{ overlap, meeting: other }] : []
  })
