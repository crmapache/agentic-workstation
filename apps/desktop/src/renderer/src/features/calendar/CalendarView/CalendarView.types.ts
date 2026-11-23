import type { CalendarSourceView } from '@shared/calendar'

import type { CalendarPeriod } from '../calendar.types'

export type CalendarToolbarProps = {
  period: CalendarPeriod
  now: number
  /** Накладок на сетке периода. */
  overlaps: number
  /** Начала накладок впереди - «следующая» листает к ближайшей после периода. */
  upcoming: readonly number[]
}

export type SyncButtonProps = {
  sources: readonly CalendarSourceView[]
}
