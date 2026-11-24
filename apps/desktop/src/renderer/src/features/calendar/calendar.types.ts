import type { CalendarMeeting } from '@shared/calendar-overlaps'

/** Что показывает сетка: неделю, один день или месяц. */
export type CalendarMode = 'week' | 'day' | 'month'

/** Вкладка боковой панели: источники или накладки впереди. */
export type SidebarTab = 'sources' | 'overlaps'

/** Окно источника: новый (null), правка (id) или закрыто (undefined). */
export type SourceEditing = string | null | undefined

/**
 * Период на сетке: местные полночи его дней и края [from, to), мс. month - полночь первого
 * числа месяца, вокруг которого период (у месяца сетка шире самого месяца).
 */
export type CalendarPeriod = { from: number; to: number; days: number[]; month: number }

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
  /** Общее время накладок внутри самого блока, доли его высоты: зона внутри, а не полоса под ним. */
  zones: ClashZone[]
}

/** Общее время накладки внутри блока встречи: верх и высота - доли высоты блока. */
export type ClashZone = { top: number; height: number; soft: boolean }
