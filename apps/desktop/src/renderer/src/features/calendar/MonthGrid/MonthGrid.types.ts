import type { CalendarMeeting } from '@shared/calendar-overlaps'

import type { OpenedMeeting, WeekGridProps } from '../WeekGrid/WeekGrid.types'

/** Месяц берёт то же, что неделя: период, встречи, горящие накладки, источники, настройки. */
export type MonthGridProps = WeekGridProps

export type MonthCellProps = {
  day: number
  /** Встречи дня по порядку: сначала на весь день, потом по времени. */
  meetings: readonly CalendarMeeting[]
  /** Встречи в непросмотренных накладках: ключ → мягкая ли накладка. */
  clashing: ReadonlyMap<string, boolean>
  isToday: boolean
  isOtherMonth: boolean
  isDayOff: boolean
  colorOf: (sourceId: string) => number
  onOpen: (opened: OpenedMeeting) => void
}
