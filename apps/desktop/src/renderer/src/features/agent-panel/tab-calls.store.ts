import { create } from 'zustand'

import type { TabCall } from './panel.types'

type TabCallsStore = {
  /** Позвавшие вкладки и чем позвали - светятся, пока не ответили (tab-calls.hooks.ts). */
  calls: Record<string, TabCall>
  addCall: (conversationId: string, call: TabCall) => void
  /** Ответили (открыли вкладку, что-то сделали в ней) или её закрыли - свет гаснет. */
  answerCalls: (conversationIds: readonly string[]) => void
}

/**
 * Свет позвавших вкладок всех провайдеров одним списком: его ставит событие agent:call на
 * уровне окна, а читают панели и вкладки проектов. У зова есть провайдер - вкладку гасит
 * только её панель.
 */
export const useTabCallsStore = create<TabCallsStore>()((set) => ({
  calls: {},
  addCall: (conversationId, call) =>
    set((state) => ({ calls: { ...state.calls, [conversationId]: call } })),
  answerCalls: (conversationIds) =>
    set((state) =>
      conversationIds.some((id) => id in state.calls)
        ? {
            calls: Object.fromEntries(
              Object.entries(state.calls).filter(([id]) => !conversationIds.includes(id)),
            ),
          }
        : state,
    ),
}))
