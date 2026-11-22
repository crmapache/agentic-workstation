import { create } from 'zustand'

/** Чтение готовится (крутилка на кнопке) или уже звучит («стоп» на ней). */
export type ReadAloudPhase = 'loading' | 'playing'

/**
 * Чтение, которое идёт на телефоне: чьей IDE и какой ответ, ref просьбы (по нему конец находит
 * своё нажатие) и n - номер чтения в кадрах звука.
 */
export type PhoneReading = {
  agentId: string
  itemId: string
  ref: string
  n: number
  phase: ReadAloudPhase
}

type ReadAloudState = {
  current: PhoneReading | null
  begin: (reading: PhoneReading) => void
  /** Пришёл первый звук - кнопка показывает «стоп». */
  playing: (ref: string) => void
  /** Чтение дозвучало, сорвалось или его остановили - только своё. */
  clear: (ref: string) => void
}

/**
 * «Прочитать вслух» на телефоне (ADR 0106) - одно чтение на страницу: кнопки ответов в ленте
 * начинают и останавливают его, звук играет хост чтения. Синтез и ключ Deepgram - в IDE.
 */
export const useReadAloudStore = create<ReadAloudState>((set, get) => ({
  current: null,
  begin: (reading) => set({ current: reading }),
  playing: (ref) => {
    const { current } = get()

    if (current?.ref === ref && current.phase !== 'playing') {
      set({ current: { ...current, phase: 'playing' } })
    }
  },
  clear: (ref) => {
    if (get().current?.ref === ref) set({ current: null })
  },
}))
