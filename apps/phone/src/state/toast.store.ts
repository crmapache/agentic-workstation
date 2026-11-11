import { create } from 'zustand'

export type ToastEntry = { id: number; title: string; description?: string | undefined }

type ToastState = {
  toasts: ToastEntry[]
  show: (title: string, description?: string) => void
  dismiss: (id: number) => void
}

/** Сколько уведомление стоит на экране, если его не смахнули. */
export const TOAST_MS = 5_000

let nextId = 1

/** Уведомления об отказах команд: IDE ответила «нет» или не ответила вовсе. */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (title, description) => {
    const id = nextId++

    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, title, description }] }))
    setTimeout(() => get().dismiss(id), TOAST_MS)
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))
