import { create } from 'zustand'

/** danger - отказ команды (по умолчанию); neutral - дело сделано, но сказать есть что (откат). */
export type ToastTone = 'neutral' | 'danger'

export type ToastEntry = {
  id: number
  title: string
  description?: string | undefined
  tone: ToastTone
}

type ToastState = {
  toasts: ToastEntry[]
  show: (title: string, description?: string, tone?: ToastTone) => void
  dismiss: (id: number) => void
}

/** Сколько уведомление стоит на экране, если его не смахнули. */
export const TOAST_MS = 5_000

let nextId = 1

/**
 * Уведомления: отказы команд (IDE ответила «нет» или не ответила вовсе) и итог действия, который
 * не виден на экране сам (откат разговора вернул текст в поле).
 */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (title, description, tone = 'danger') => {
    const id = nextId++

    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, title, description, tone }] }))
    setTimeout(() => get().dismiss(id), TOAST_MS)
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))
