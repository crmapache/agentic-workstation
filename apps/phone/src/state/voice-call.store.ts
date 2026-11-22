import { create } from 'zustand'

import type { VoiceEvent } from '@agentic-workstation/remote-protocol/agent-messages'

import type { PhoneCall } from './voice-call.utils'
import { startingCall, applyVoiceEvent } from './voice-call.utils'

type VoiceCallState = {
  /** Звонок с каждой IDE по её адресу: у IDE он один. */
  calls: Record<string, PhoneCall>
  begin: (agentId: string, ref: string) => void
  event: (agentId: string, event: VoiceEvent) => void
  clear: (agentId: string) => void
}

/**
 * Голосовые звонки телефона (ADR 0104): просьбу начинает кнопка, слова звонка от IDE кладёт
 * ядро (state/mirror.ts), читают кнопка звонка, полоса над разговором и звук звонка.
 */
export const useVoiceCallStore = create<VoiceCallState>((set) => ({
  calls: {},
  begin: (agentId, ref) =>
    set((state) => ({ calls: { ...state.calls, [agentId]: startingCall(ref) } })),
  event: (agentId, event) =>
    set((state) => {
      const next = applyVoiceEvent(state.calls[agentId], event)

      return next === state.calls[agentId] || !next
        ? state
        : { calls: { ...state.calls, [agentId]: next } }
    }),
  clear: (agentId) =>
    set((state) => {
      const { [agentId]: _gone, ...rest } = state.calls

      return { calls: rest }
    }),
}))
