import { create } from 'zustand'

import type { CalendarMode, SourceEditing } from './calendar.types'

type CalendarStore = {
  mode: CalendarMode
  /** Местная полночь дня, вокруг которого период; null - сегодня. */
  anchor: number | null
  /** Окно источника: новый (null), правка (id) или закрыто (undefined). */
  editing: SourceEditing
  /** Панель источников рядом с сеткой: в узкой середине её прячут, отдавая место дням. */
  sourcesOpen: boolean
  setMode: (mode: CalendarMode) => void
  setAnchor: (anchor: number | null) => void
  edit: (sourceId: string | null) => void
  closeEditor: () => void
  toggleSources: () => void
}

/**
 * Интерфейсное состояние календаря звонков (ADR 0114): неделя или день, листание, окно
 * источника. Источники и события - в кэше запросов (state/calendar.queries.ts).
 */
export const useCalendarStore = create<CalendarStore>()((set) => ({
  mode: 'week',
  anchor: null,
  editing: undefined,
  sourcesOpen: true,
  setMode: (mode) => set({ mode }),
  setAnchor: (anchor) => set({ anchor }),
  edit: (sourceId) => set({ editing: sourceId }),
  closeEditor: () => set({ editing: undefined }),
  toggleSources: () => set((state) => ({ sourcesOpen: !state.sourcesOpen })),
}))
