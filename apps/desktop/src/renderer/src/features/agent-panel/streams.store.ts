import { create } from 'zustand'

import { MAIN_STREAM } from './agents.constants'
import type { FleetAgentRef, StreamSelection } from './streams.types'

type StreamsStore = {
  /** Выбор по разговору; нет записи - main. */
  byConversation: Record<string, StreamSelection>
  /** Чип потока: itemId - вызов агента, null - main. Окно агента флота закрывается. */
  pickStream: (conversationId: string, itemId: string | null) => void
  /** Строка агента флота: его окно поверх того, что было. */
  openFleetAgent: (conversationId: string, ref: FleetAgentRef) => void
  /** Крестик и Escape окна агента флота: назад к тому, что было под ним. */
  closeFleetAgent: (conversationId: string) => void
}

/**
 * Какой поток разговора смотрят: main (лента), агента или окно агента флота. Только
 * интерфейс и только на сеанс окна: после перезагрузки все смотрят ленту.
 */
export const useStreamsStore = create<StreamsStore>()((set) => ({
  byConversation: {},
  pickStream: (conversationId, itemId) =>
    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [conversationId]: { stream: itemId, fleet: null },
      },
    })),
  openFleetAgent: (conversationId, ref) =>
    set((state) => {
      const current = state.byConversation[conversationId] ?? MAIN_STREAM

      return {
        byConversation: { ...state.byConversation, [conversationId]: { ...current, fleet: ref } },
      }
    }),
  closeFleetAgent: (conversationId) =>
    set((state) => {
      const current = state.byConversation[conversationId] ?? MAIN_STREAM

      return {
        byConversation: { ...state.byConversation, [conversationId]: { ...current, fleet: null } },
      }
    }),
}))
