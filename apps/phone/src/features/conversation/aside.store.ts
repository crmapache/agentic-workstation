import { create } from 'zustand'

import type { AsideAnswerWire } from '@agentic-workstation/remote-protocol/conversation-wire-types'

import type { CommandError } from '../../state/command-error'

/**
 * Вопрос сбоку с этого телефона: ответ приходит только спросившему, IDE его телефону потом не
 * повторит - поэтому вопросы и ответы держатся здесь, пока страница жива. answer и error пусты -
 * модель ещё думает.
 */
export type AsideEntry = {
  askId: string
  question: string
  /** Когда спросили (часы телефона): «Thinking aside · 12s». */
  askedAt: number
  answer: AsideAnswerWire | null
  /** Команда не дошла или IDE отказала (не ответ модели). */
  error: CommandError | null
}

type AsideState = {
  /** По разговору: `${agentId}|${conversationId}`, как черновик поля. */
  asks: Record<string, AsideEntry[]>
  add: (key: string, entry: AsideEntry) => void
  settle: (key: string, askId: string, result: Pick<AsideEntry, 'answer' | 'error'>) => void
}

/** Пусто - одной ссылкой: новый пустой список на каждый рендер перерисовывал бы окно. */
export const NO_ASKS: AsideEntry[] = []

export const useAsideStore = create<AsideState>((set) => ({
  asks: {},
  add: (key, entry) =>
    set((state) => ({ asks: { ...state.asks, [key]: [...(state.asks[key] ?? []), entry] } })),
  settle: (key, askId, result) =>
    set((state) => ({
      asks: {
        ...state.asks,
        [key]: (state.asks[key] ?? []).map((entry) =>
          entry.askId === askId ? { ...entry, ...result } : entry,
        ),
      },
    })),
}))
