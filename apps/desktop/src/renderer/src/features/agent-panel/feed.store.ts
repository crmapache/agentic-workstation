import { create } from 'zustand'

/**
 * Где человек читал ленту вкладки: строка у верхней кромки и насколько её верх выше
 * кромки; atEnd - стоял в конце (тогда и вернётся в конец, что бы туда ни дописалось).
 */
export type ReadingPlace = {
  atEnd: boolean
  rowId: string | null
  offset: number
  scrollTop: number
}

type FeedStore = {
  /** Место чтения по разговору: лента строится заново на каждом переключении вкладки. */
  places: Record<string, ReadingPlace>
  setPlace: (conversationId: string, place: ReadingPlace) => void
  /** Планы, по которым человек решил здесь: карточка уходит из ленты (как в ACC). */
  decidedPlans: ReadonlySet<string>
  decidePlan: (toolId: string) => void
  /** Ошибки, закрытые крестиком. */
  dismissed: ReadonlySet<string>
  dismiss: (itemId: string) => void
}

/**
 * Интерфейсное состояние ленты, которое живёт дольше самой ленты: место чтения по
 * вкладке, решённые планы, закрытые ошибки. Сами элементы ленты - у главного процесса.
 */
export const useFeedStore = create<FeedStore>()((set) => ({
  places: {},
  setPlace: (conversationId, place) =>
    set((state) => ({ places: { ...state.places, [conversationId]: place } })),
  decidedPlans: new Set(),
  decidePlan: (toolId) =>
    set((state) => ({ decidedPlans: new Set([...state.decidedPlans, toolId]) })),
  dismissed: new Set(),
  dismiss: (itemId) => set((state) => ({ dismissed: new Set([...state.dismissed, itemId]) })),
}))
