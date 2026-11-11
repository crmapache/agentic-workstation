import { create } from 'zustand'

/** Итог действия для угла окна: тон, заголовок и строки под ним (что ответил git, сколько ссылок). */
export type ActionNotice = {
  tone: 'success' | 'danger'
  title: string
  details?: string | undefined
}

type ActionNoticeStore = {
  notice: ActionNotice | null
  show: (notice: ActionNotice) => void
  dismiss: () => void
}

/**
 * Итог последнего действия человека - git, дерево файлов - в углу окна. Одно на окно: новое
 * действие заменяет старый итог. Рисует его workbench (ActionNotice), фичи только сообщают.
 */
export const useActionNoticeStore = create<ActionNoticeStore>()((set) => ({
  notice: null,
  show: (notice) => set({ notice }),
  dismiss: () => set({ notice: null }),
}))
