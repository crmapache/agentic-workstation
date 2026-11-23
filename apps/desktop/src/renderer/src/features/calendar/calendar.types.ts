import type { CalendarMeeting } from '@shared/calendar-overlaps'

/** Что показывает сетка: неделю или один день. */
export type CalendarMode = 'week' | 'day'

/** Окно источника: новый (null), правка (id) или закрыто (undefined). */
export type SourceEditing = string | null | undefined

/** Период на сетке: местные полночи его дней и края [from, to), мс. */
export type CalendarPeriod = { from: number; to: number; days: number[] }

/**
 * Встреча на одном дне сетки: минуты от полуночи этого дня (обрезаны его краями) и колонка
 * среди встреч, которые с ней пересекаются.
 */
export type DayBlock = {
  meeting: CalendarMeeting
  startMinute: number
  endMinute: number
  column: number
  columns: number
  /** Встреча в накладке: обводка предупреждения. */
  clashing: boolean
  /** Накладка мягкая: одна из встреч под вопросом. */
  soft: boolean
}

/** Общий отрезок накладки на дне сетки, в минутах от полуночи. */
export type DayBand = { startMinute: number; endMinute: number; soft: boolean }
