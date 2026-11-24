import type { CalendarSourceView } from '@shared/calendar'
import type { CalendarMeeting, CalendarOverlap } from '@shared/calendar-overlaps'
import type { CalendarSettings } from '@shared/calendar-settings'

import type { DayBlock, CalendarPeriod } from '../calendar.types'

export type WeekGridProps = {
  period: CalendarPeriod
  meetings: readonly CalendarMeeting[]
  /** Накладки, которые горят: непросмотренные. */
  overlaps: readonly CalendarOverlap[]
  sources: readonly CalendarSourceView[]
  settings: CalendarSettings
  now: number
  onOpen: (opened: OpenedMeeting) => void
}

/** Открытая карточка встречи: какая и у какого блока встаёт. */
export type OpenedMeeting = { meeting: CalendarMeeting; anchor: HTMLElement }

export type DayColumnProps = {
  blocks: readonly DayBlock[]
  /** Рабочее время дня, минуты от полуночи; null - выходной. */
  work: { from: number; to: number } | null
  /** Минута «сейчас», если день - сегодня; иначе null. */
  nowMinute: number | null
  /** Сейчас, мс: прошедшие встречи тише. */
  now: number
  colorOf: (sourceId: string) => number
  onOpen: (opened: OpenedMeeting) => void
}

export type EventBlockProps = {
  block: DayBlock
  /** Встреча уже кончилась: блок тише. */
  past: boolean
  colorOf: (sourceId: string) => number
  onOpen: (opened: OpenedMeeting) => void
}

export type AllDayRowProps = {
  days: readonly number[]
  meetings: readonly CalendarMeeting[]
  now: number
  colorOf: (sourceId: string) => number
  isDayOff: (day: number) => boolean
  onOpen: (opened: OpenedMeeting) => void
}
