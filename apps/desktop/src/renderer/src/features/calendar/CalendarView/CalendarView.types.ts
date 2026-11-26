import type { CalendarState, CalendarSourceView } from '@shared/calendar'
import type { CalendarMeeting, CalendarOverlap } from '@shared/calendar-overlaps'

import type { CalendarPeriod } from '../calendar.types'

export type CalendarToolbarProps = {
  period: CalendarPeriod
  now: number
  /** Непросмотренных накладок периода впереди - тех, что горят на сетке. */
  overlaps: number
  /** Начала накладок впереди - «следующая» листает к ближайшей после периода. */
  upcoming: readonly number[]
}

export type SyncButtonProps = {
  sources: readonly CalendarSourceView[]
}

export type CalendarBodyProps = {
  period: CalendarPeriod
  meetings: readonly CalendarMeeting[]
  /** Накладки периода впереди и идущие - карточке встречи, с просмотренными. */
  overlaps: readonly CalendarOverlap[]
  /** Непросмотренные - горят на сетке. */
  active: readonly CalendarOverlap[]
  state: CalendarState
  now: number
}
