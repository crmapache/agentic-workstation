import { create } from 'zustand'

/** Сколько карточек в углу окна сразу: дальше старые уходят - всё есть на виде уведомлений. */
const TOASTS_MAX = 3

type InboxUiStore = {
  /** Уведомления карточками в углу окна, новые последними. */
  toasts: string[]
  /** Уведомление, к которому вид уведомлений прокрутит и подсветит (нажали баннер ОС). */
  revealed: string | null
  pushToast: (itemId: string) => void
  dropToast: (itemId: string) => void
  reveal: (itemId: string) => void
  clearReveal: () => void
}

/**
 * Интерфейсное состояние уведомлений (ADR 0069): что лежит карточками в углу окна и что
 * показать на виде. В state: карточки кладёт подписка окна, а показывают вид и угол окна.
 */
export const useInboxUiStore = create<InboxUiStore>()((set) => ({
  toasts: [],
  revealed: null,
  pushToast: (itemId) =>
    set((state) => ({
      toasts: [...state.toasts.filter((id) => id !== itemId), itemId].slice(-TOASTS_MAX),
    })),
  dropToast: (itemId) => set((state) => ({ toasts: state.toasts.filter((id) => id !== itemId) })),
  reveal: (itemId) =>
    set((state) => ({ revealed: itemId, toasts: state.toasts.filter((id) => id !== itemId) })),
  clearReveal: () => set({ revealed: null }),
}))
