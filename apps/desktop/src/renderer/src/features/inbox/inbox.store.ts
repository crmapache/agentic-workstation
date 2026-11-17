import { create } from 'zustand'

import type { InboxTab, InboxNotice } from './inbox.types'

type InboxStore = {
  tab: InboxTab
  /** Окно «Remind me» открыто. */
  reminding: boolean
  /** Почему нажатие не прошло - в углу окна, пока не закроют. */
  notice: InboxNotice | null
  setTab: (tab: InboxTab) => void
  setReminding: (reminding: boolean) => void
  fail: (code: string) => void
  dismissNotice: () => void
}

/** Интерфейсное состояние вида уведомлений (ADR 0069): вкладка, окно напоминания, отказ. */
export const useInboxStore = create<InboxStore>()((set) => ({
  tab: 'open',
  reminding: false,
  notice: null,
  setTab: (tab) => set({ tab }),
  setReminding: (reminding) => set({ reminding }),
  fail: (code) => set({ notice: { code } }),
  dismissNotice: () => set({ notice: null }),
}))
