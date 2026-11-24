import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN, CALENDAR_STORAGE_KEY } from './calendar.constants'
import type { SidebarTab, CalendarMode, SourceEditing } from './calendar.types'

type CalendarStore = {
  mode: CalendarMode
  /** Местная полночь дня, вокруг которого период; null - сегодня. */
  anchor: number | null
  /** Окно источника: новый (null), правка (id) или закрыто (undefined). */
  editing: SourceEditing
  /** Боковая панель рядом с сеткой: в узкой середине её прячут, отдавая место дням. */
  sourcesOpen: boolean
  sidebarTab: SidebarTab
  /** Ширина боковой панели, px; null - по умолчанию (токен). Тянут ручкой у её края. */
  sidebarWidth: number | null
  setMode: (mode: CalendarMode) => void
  setAnchor: (anchor: number | null) => void
  edit: (sourceId: string | null) => void
  closeEditor: () => void
  toggleSources: () => void
  showTab: (tab: SidebarTab) => void
  setSidebarWidth: (width: number) => void
}

const clampWidth = (width: number) =>
  Math.round(Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width)))

const MODES: ReadonlySet<unknown> = new Set<CalendarMode>(['week', 'day', 'month'])

/** Сохранённое прошлым запуском - только понятное этому: иначе как было. */
const restore = (saved: unknown): Partial<CalendarStore> => {
  const { mode, sourcesOpen, sidebarWidth } = (saved ?? {}) as Record<string, unknown>

  return {
    ...(MODES.has(mode) && { mode: mode as CalendarMode }),
    ...(typeof sourcesOpen === 'boolean' && { sourcesOpen }),
    ...(typeof sidebarWidth === 'number' &&
      Number.isFinite(sidebarWidth) && { sidebarWidth: clampWidth(sidebarWidth) }),
  }
}

/**
 * Интерфейсное состояние календаря звонков (ADR 0114, 0116): неделя, день или месяц, листание,
 * окно источника, боковая панель - открыта ли, какая вкладка, ширина. Между перезапусками
 * помнятся вид, открыта ли панель и её ширина. Источники и события - в кэше запросов
 * (state/calendar.queries.ts).
 */
export const useCalendarStore = create<CalendarStore>()(
  persist(
    (set) => ({
      mode: 'week',
      anchor: null,
      editing: undefined,
      sourcesOpen: true,
      sidebarTab: 'sources',
      sidebarWidth: null,
      setMode: (mode) => set({ mode }),
      setAnchor: (anchor) => set({ anchor }),
      edit: (sourceId) => set({ editing: sourceId }),
      closeEditor: () => set({ editing: undefined }),
      toggleSources: () => set((state) => ({ sourcesOpen: !state.sourcesOpen })),
      showTab: (sidebarTab) => set({ sidebarTab, sourcesOpen: true }),
      setSidebarWidth: (width) => set({ sidebarWidth: clampWidth(width) }),
    }),
    {
      name: CALENDAR_STORAGE_KEY,
      partialize: ({ mode, sourcesOpen, sidebarWidth }) => ({ mode, sourcesOpen, sidebarWidth }),
      merge: (saved, current) => ({ ...current, ...restore(saved) }),
    },
  ),
)
