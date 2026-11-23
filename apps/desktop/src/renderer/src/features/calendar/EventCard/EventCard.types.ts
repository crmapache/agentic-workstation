import type { CalendarSourceView } from '@shared/calendar'
import type { CalendarMeeting, CalendarOverlap } from '@shared/calendar-overlaps'

import type { OpenedMeeting } from '../WeekGrid/WeekGrid.types'

export type EventCardProps = {
  opened: OpenedMeeting
  meetings: readonly CalendarMeeting[]
  overlaps: readonly CalendarOverlap[]
  sources: readonly CalendarSourceView[]
  onClose: () => void
}
