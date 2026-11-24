import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import type { CalendarEvent, CalendarSourceView } from '@shared/calendar'
import type { CalendarMeeting, CalendarOverlap } from '@shared/calendar-overlaps'

import type { OpenedMeeting } from '../WeekGrid/WeekGrid.types'

export type EventCardProps = {
  opened: OpenedMeeting
  meetings: readonly CalendarMeeting[]
  /** Все накладки периода, и просмотренные. */
  overlaps: readonly CalendarOverlap[]
  /** Ключи накладок, отмеченных «видел». */
  seen: readonly string[]
  sources: readonly CalendarSourceView[]
  onClose: () => void
}

/** Накладка встречи и встреча, с которой она. */
export type Clash = { overlap: CalendarOverlap; meeting: CalendarMeeting }

export type FactRowProps = {
  icon: LucideIcon
  /** Что за строка - для скринридера: значок его не скажет. */
  label: string
  children: ReactNode
}

export type EventFactProps = { event: CalendarEvent }

export type LinkTextProps = {
  text: string
  /** Ссылка https; null - просто текст. */
  url: string | null
}

export type ClashAlertProps = {
  overlap: CalendarOverlap
  meeting: CalendarMeeting
  seen: boolean
  /** Календарь другой встречи. */
  source: string
}
