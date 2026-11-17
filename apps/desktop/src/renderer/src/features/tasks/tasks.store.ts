import { create } from 'zustand'

import type { TasksTab, TaskEditing, TasksNotice } from './tasks.types'

type TasksStore = {
  tab: TasksTab
  /** Окно правки задания: новое (null), правка (id) или закрыто (undefined). */
  editing: TaskEditing
  /** Почему действие не прошло - в углу окна, пока не закроют. */
  notice: TasksNotice | null
  setTab: (tab: TasksTab) => void
  edit: (taskId: string | null) => void
  closeEditor: () => void
  fail: (code: string) => void
  dismissNotice: () => void
}

/**
 * Интерфейсное состояние вида заданий (ADR 0069): вкладка, окно правки, отказ. Открытый прогон -
 * в state (task-run.store): его открывают и из уведомлений.
 */
export const useTasksStore = create<TasksStore>()((set) => ({
  tab: 'tasks',
  editing: undefined,
  notice: null,
  setTab: (tab) => set({ tab }),
  edit: (taskId) => set({ editing: taskId }),
  closeEditor: () => set({ editing: undefined }),
  fail: (code) => set({ notice: { code } }),
  dismissNotice: () => set({ notice: null }),
}))
