import { create } from 'zustand'

import type { InboxTab, InboxNotice } from './inbox.types'

type InboxStore = {
  tab: InboxTab
  /** Окно «Remind me» открыто. */
  reminding: boolean
  /** Почему нажатие не прошло - в углу окна, пока не закроют. */
  notice: InboxNotice | null
  /**
   * Раскрыл или свернул человек карточку на виде - по id; нет записи - как по умолчанию
   * (expandedByDefault). Живёт, пока открыта IDE: выбор держится при смене вкладки и когда ответ
   * переносит карточку в Done.
   */
  expanded: Record<string, boolean>
  setTab: (tab: InboxTab) => void
  setReminding: (reminding: boolean) => void
  fail: (code: string) => void
  dismissNotice: () => void
  setExpanded: (itemId: string, expanded: boolean) => void
}

/**
 * Интерфейсное состояние вида уведомлений (ADR 0069): вкладка, окно напоминания, отказ, раскрытые
 * карточки.
 */
export const useInboxStore = create<InboxStore>()((set) => ({
  tab: 'open',
  reminding: false,
  notice: null,
  expanded: {},
  setTab: (tab) => set({ tab }),
  setReminding: (reminding) => set({ reminding }),
  fail: (code) => set({ notice: { code } }),
  dismissNotice: () => set({ notice: null }),
  setExpanded: (itemId, expanded) =>
    set((state) =>
      state.expanded[itemId] === expanded
        ? state
        : { expanded: { ...state.expanded, [itemId]: expanded } },
    ),
}))
