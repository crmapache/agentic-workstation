import { create } from 'zustand'

type TerminalStore = {
  /** Выбранная вкладка терминала каждого проекта. Нет или закрыта - последняя у проекта. */
  active: Record<string, string>
  /**
   * Просьба поставить клавиатуру в выбранный терминал (кнопка, ⌥F12, новая вкладка). Её
   * снимает окно выбранной вкладки, когда терминал в нём открыт: оболочка может ещё
   * запускаться, а просьба не должна пропасть.
   */
  focusPending: boolean
  /** Проекты, где оболочка не запустилась: сама она больше не пробует, только по «+». */
  failed: Record<string, boolean>
  pick: (projectId: string, sessionId: string) => void
  requestFocus: () => void
  focusTaken: () => void
  setFailed: (projectId: string, failed: boolean) => void
}

/** Интерфейсное состояние терминала: выбор вкладки и просьба о фокусе. Сессии - в кэше. */
export const useTerminalStore = create<TerminalStore>()((set) => ({
  active: {},
  focusPending: false,
  failed: {},
  pick: (projectId, sessionId) =>
    set((state) => ({ active: { ...state.active, [projectId]: sessionId } })),
  requestFocus: () => set({ focusPending: true }),
  focusTaken: () => set({ focusPending: false }),
  setFailed: (projectId, failed) =>
    set((state) =>
      state.failed[projectId] === failed
        ? state
        : { failed: { ...state.failed, [projectId]: failed } },
    ),
}))
