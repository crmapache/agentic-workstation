import { create } from 'zustand'

import type { VoiceReadRefusal } from '@shared/voice-reading'

import { invoke } from '../lib/ipc'

/** Чтение готовится (крутилка на кнопке) или уже звучит («стоп» на ней). */
export type ReadAloudPhase = 'loading' | 'playing'

/** Чтение, которое идёт в окне: id у главного процесса и чей это ответ в ленте. */
export type ReadAloud = { readingId: string; itemId: string; phase: ReadAloudPhase }

/** Почему не зазвучало: отказ главного процесса или канал не ответил. */
export type ReadAloudRefusal = VoiceReadRefusal | 'failed'

type ReadAloudStore = {
  current: ReadAloud | null
  /**
   * Нажатие на кнопку ответа: чтение того же ответа - стоп, другого - прежнее замолкает и
   * начинается новое. Отказ - причиной: кнопка скажет её человеку.
   */
  toggle: (itemId: string, text: string) => Promise<ReadAloudRefusal | null>
  /** Пришёл первый звук чтения - кнопка показывает «стоп». */
  playing: (readingId: string) => void
  /** Чтение дозвучало, сорвалось или его остановили - кнопка снова «слушать». */
  finish: (readingId: string) => void
}

/**
 * «Прочитать вслух» в окне (ADR 0106) - одно чтение на окно: кнопки ответов в ленте начинают и
 * останавливают его, звук играет хост голоса (features/voice). Звук и ключ Deepgram - в главном
 * процессе, здесь только чьё чтение и в какой оно фазе.
 */
export const useReadAloudStore = create<ReadAloudStore>()((set, get) => ({
  current: null,
  toggle: async (itemId, text) => {
    const before = get().current

    if (before) void invoke('voice:stopReading', { readingId: before.readingId })

    if (before?.itemId === itemId) {
      set({ current: null })

      return null
    }

    const readingId = crypto.randomUUID()

    set({ current: { readingId, itemId, phase: 'loading' } })

    const refusal = await invoke('voice:read', { readingId, text }).catch((error: unknown) => {
      console.warn('Voice: reading aloud did not start', error)

      return 'failed' as const
    })

    if (refusal && get().current?.readingId === readingId) set({ current: null })

    return refusal
  },
  playing: (readingId) => {
    const { current } = get()

    if (current?.readingId === readingId && current.phase !== 'playing') {
      set({ current: { ...current, phase: 'playing' } })
    }
  },
  finish: (readingId) => {
    if (get().current?.readingId === readingId) set({ current: null })
  },
}))
