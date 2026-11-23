import type { CalendarSourceView } from '@shared/calendar'
import type { CalendarMeeting, CalendarOverlap } from '@shared/calendar-overlaps'

import type { DayBand, DayBlock, CalendarPeriod } from '../calendar.types'

export type WeekGridProps = {
  period: CalendarPeriod
  meetings: readonly CalendarMeeting[]
  overlaps: readonly CalendarOverlap[]
  sources: readonly CalendarSourceView[]
  now: number
}

/** Открытая карточка встречи: какая и у какого блока встаёт. */
export type OpenedMeeting = { meeting: CalendarMeeting; anchor: HTMLElement }

export type DayColumnProps = {
  blocks: readonly DayBlock[]
  bands: readonly DayBand[]
  /** Минута «сейчас», если день - сегодня; иначе null. */
  nowMinute: number | null
  colorOf: (sourceId: string) => number
  onOpen: (opened: OpenedMeeting) => void
}

export type EventBlockProps = {
  block: DayBlock
  colorOf: (sourceId: string) => number
  onOpen: (opened: OpenedMeeting) => void
}

export type AllDayRowProps = {
  days: readonly number[]
  meetings: readonly CalendarMeeting[]
  colorOf: (sourceId: string) => number
  onOpen: (opened: OpenedMeeting) => void
}
