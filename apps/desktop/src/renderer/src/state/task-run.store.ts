import { create } from 'zustand'

type TaskRunStore = {
  /** Прогон задания, открытый окном по центру вида заданий; null - закрыт. */
  runId: string | null
  open: (runId: string) => void
  close: () => void
}

/**
 * Какой прогон задания открыт (ADR 0069). В state, а не в фиче заданий: прогон открывают и из
 * уведомлений (кнопка Show run), а фичи друг друга не видят.
 */
export const useTaskRunStore = create<TaskRunStore>()((set) => ({
  runId: null,
  open: (runId) => set({ runId }),
  close: () => set({ runId: null }),
}))
