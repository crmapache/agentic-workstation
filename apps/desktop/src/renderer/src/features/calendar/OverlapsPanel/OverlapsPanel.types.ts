import type { CalendarState, CalendarSourceView } from '@shared/calendar'
import type { CalendarMeeting } from '@shared/calendar-overlaps'
import type { OverlapView } from '@shared/calendar-review'

export type OverlapsPanelProps = {
  state: CalendarState
}

/** Накладки одного дня: местная полночь, подпись дня и сами накладки по времени. */
export type OverlapDay = { day: number; label: string; overlaps: OverlapView[] }

export type OverlapRowProps = {
  overlap: OverlapView
  sources: readonly CalendarSourceView[]
  /** Подписать день у времени: в списке просмотренных дней-заголовков нет. */
  withDay?: boolean | undefined
}

export type MeetingLineProps = {
  meeting: CalendarMeeting
  sources: readonly CalendarSourceView[]
}
