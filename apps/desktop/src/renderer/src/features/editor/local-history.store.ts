import { create } from 'zustand'

import type { HistoryCompare } from './editor.types'

type LocalHistoryStore = {
  compare: HistoryCompare
  setCompare: (compare: HistoryCompare) => void
}

/**
 * Что сравнивает вкладка локальной истории: версию с файлом сейчас (по умолчанию, как в
 * WebStorm) или что поменяло само событие. Выбор один на окно: листая историю, человек
 * смотрит одним способом.
 */
export const useLocalHistoryStore = create<LocalHistoryStore>()((set) => ({
  compare: 'current',
  setCompare: (compare) => set({ compare }),
}))
