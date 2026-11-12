import { create } from 'zustand'

import type { DraftChip } from '@shared/claude-draft'

/** Кусок для открытого чата провайдера ИИ: чей проект и чип, который встанет в поле. */
export type ChatHandoff = { projectId: string; chip: DraftChip }

type ChatHandoffStore = {
  /** Куски по порядку: второй, отправленный до появления разговора, не стирает первый. */
  pending: readonly ChatHandoff[]
  /** Передать кусок; панель провайдера возьмёт его, как только окажется на экране. */
  hand: (handoff: ChatHandoff) => void
  /** Взять куски своего проекта: панель кладёт их в поле, и они больше не ждут. */
  take: (projectId: string) => ChatHandoff[]
}

/**
 * Передача из других частей окна в чат провайдера ИИ («Send to Chat» в меню редактора). Отдающий
 * не знает, какой провайдер открыт и смонтирована ли его панель: он кладёт кусок сюда и
 * показывает панель, а панель, оказавшись на экране, забирает его в поле активного чата.
 */
export const useChatHandoffStore = create<ChatHandoffStore>()((set, get) => ({
  pending: [],
  hand: (handoff) => set((state) => ({ pending: [...state.pending, handoff] })),
  take: (projectId) => {
    const mine = get().pending.filter((handoff) => handoff.projectId === projectId)

    if (mine.length > 0) {
      set((state) => ({
        pending: state.pending.filter((handoff) => handoff.projectId !== projectId),
      }))
    }

    return mine
  },
}))
