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
  /**
   * Сетке не хватает места рядом с панелью (меряет вид): панель не теснит дни, а уходит сама и
   * открывается поверх сетки. Выбор человека (sourcesOpen) при этом не трогается.
   */
  narrow: boolean
  /** Панель открыта поверх сетки - только в узком виде; место вернулось - сбрасывается. */
  peek: boolean
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
  setNarrow: (narrow: boolean) => void
  closePeek: () => void
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
 * окно источника, боковая панель - открыта ли, какая вкладка, ширина, сбоку она или поверх
 * узкой сетки. Между перезапусками помнятся вид, открыта ли панель и её ширина. Источники и события - в кэше запросов
 * (state/calendar.queries.ts).
 */
export const useCalendarStore = create<CalendarStore>()(
  persist(
    (set) => ({
      mode: 'week',
      anchor: null,
      editing: undefined,
      sourcesOpen: true,
      narrow: false,
      peek: false,
      sidebarTab: 'sources',
      sidebarWidth: null,
      setMode: (mode) => set({ mode }),
      setAnchor: (anchor) => set({ anchor }),
      edit: (sourceId) => set({ editing: sourceId }),
      closeEditor: () => set({ editing: undefined }),
      // В узком виде кнопка и вкладки открывают панель поверх сетки, а не меняют выбор человека.
      toggleSources: () =>
        set((state) =>
          state.narrow ? { peek: !state.peek } : { sourcesOpen: !state.sourcesOpen },
        ),
      showTab: (sidebarTab) =>
        set((state) =>
          state.narrow ? { sidebarTab, peek: true } : { sidebarTab, sourcesOpen: true },
        ),
      setSidebarWidth: (width) => set({ sidebarWidth: clampWidth(width) }),
      setNarrow: (narrow) =>
        set((state) => (state.narrow === narrow ? state : { narrow, peek: false })),
      closePeek: () => set({ peek: false }),
    }),
    {
      name: CALENDAR_STORAGE_KEY,
      partialize: ({ mode, sourcesOpen, sidebarWidth }) => ({ mode, sourcesOpen, sidebarWidth }),
      merge: (saved, current) => ({ ...current, ...restore(saved) }),
    },
  ),
)
