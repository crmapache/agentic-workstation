import { create } from 'zustand'

import type { SearchHit, PaintedTerm, AiSearchStep, AiSearchOutcome } from '@shared/claude-search'

import type {
  SearchTab,
  AiRunState,
  CapsuleNote,
  SearchFocus,
  SearchCapsuleState,
} from './search.types'

type SearchStore = {
  /** Окно поиска на экране. Спрятанное (Esc, клик мимо) держит всё, что в нём было. */
  isOpen: boolean
  /** Вкладка разговора, над которой открыли окно: её закрыли - поиск кончается. */
  originId: string | null
  tab: SearchTab
  /** Набранный запрос - один на обе области: вкладка меняет, где искать, а не что. */
  query: string
  matchCase: boolean
  wholeWords: boolean
  ai: AiRunState
  capsule: SearchCapsuleState | null
  focus: SearchFocus | null
  openSearch: (originId: string | null) => void
  /** Escape и клик мимо: окно прячется, всё в нём остаётся (капсула вернёт). */
  closeSearch: () => void
  /** Крестик: с поиском покончено - окно, капсула, оба поля и ответы. */
  resetSearch: () => void
  setTab: (tab: SearchTab) => void
  setQuery: (query: string) => void
  setMatchCase: (on: boolean) => void
  setWholeWords: (on: boolean) => void
  setAiQuery: (query: string) => void
  startAi: (runId: string) => void
  addAiStep: (step: AiSearchStep) => void
  finishAi: (runId: string, outcome: AiSearchOutcome) => void
  /**
   * Находку выбрали: окно сворачивается в капсулу над её разговором (id вкладки), лента идёт
   * к ней. hits - находки этого разговора по порядку в нём, terms - что красить.
   */
  showHit: (conversationId: string, hit: SearchHit, hits: SearchHit[], terms: PaintedTerm[]) => void
  /** Стрелки капсулы: на находку выше или ниже по разговору, по кругу. */
  stepHit: (direction: 1 | -1) => void
  /** Лента дошла до находки или не смогла - капсула скажет. */
  landHit: (nonce: number, note: CapsuleNote) => void
}

const NO_AI: AiRunState = {
  query: '',
  runId: null,
  startedAt: 0,
  steps: [],
  hits: [],
  answered: false,
  failure: null,
}

let nextNonce = 1

/**
 * Интерфейсное состояние поиска по разговорам (как в ACC): окно, его поля и вкладка,
 * прогон модели, капсула в углу ленты и прыжок к находке. Находки набранного запроса -
 * в кэше React Query (search.queries), ищет главный процесс.
 */
export const useSearchStore = create<SearchStore>()((set) => ({
  isOpen: false,
  originId: null,
  tab: 'chat',
  query: '',
  matchCase: false,
  wholeWords: false,
  ai: NO_AI,
  capsule: null,
  focus: null,
  openSearch: (originId) =>
    set((state) => ({ isOpen: true, originId: state.capsule?.conversationId ?? originId })),
  closeSearch: () => set({ isOpen: false }),
  resetSearch: () =>
    set({
      isOpen: false,
      originId: null,
      query: '',
      ai: NO_AI,
      capsule: null,
      focus: null,
    }),
  setTab: (tab) => set({ tab }),
  setQuery: (query) => set({ query }),
  setMatchCase: (matchCase) => set({ matchCase }),
  setWholeWords: (wholeWords) => set({ wholeWords }),
  setAiQuery: (query) =>
    set((state) => ({
      ai: { ...state.ai, query, answered: query === state.ai.query && state.ai.answered },
    })),
  startAi: (runId) =>
    set((state) => ({
      ai: { ...state.ai, runId, startedAt: Date.now(), steps: [], failure: null },
    })),
  addAiStep: ({ runId, kind, subject }) =>
    set((state) =>
      state.ai.runId === runId
        ? { ai: { ...state.ai, steps: [...state.ai.steps, { kind, subject }] } }
        : state,
    ),
  finishAi: (runId, outcome) =>
    set((state) => {
      // Ответ отменённого или прошлого прогона никому не нужен.
      if (state.ai.runId !== runId) return state

      const ai = { ...state.ai, runId: null }

      if (outcome.status === 'found') return { ai: { ...ai, hits: outcome.hits, answered: true } }
      if (outcome.status === 'failed') {
        return { ai: { ...ai, failure: { reason: outcome.reason, detail: outcome.detail } } }
      }

      return { ai }
    }),
  showHit: (conversationId, hit, hits, terms) => {
    const nonce = nextNonce++

    set({
      isOpen: false,
      capsule: {
        conversationId,
        hits,
        at: Math.max(
          0,
          hits.findIndex((one) => one.uuid === hit.uuid),
        ),
        note: 'loading',
        terms,
      },
      focus: { conversationId, hit, nonce },
    })
  },
  stepHit: (direction) =>
    set((state) => {
      const { capsule } = state

      if (!capsule || capsule.hits.length < 2) return state

      const at = (capsule.at + direction + capsule.hits.length) % capsule.hits.length
      const hit = capsule.hits[at]

      if (!hit) return state

      return {
        capsule: { ...capsule, at, note: 'loading' },
        focus: { conversationId: capsule.conversationId, hit, nonce: nextNonce++ },
      }
    }),
  landHit: (nonce, note) =>
    set((state) =>
      state.focus?.nonce === nonce && state.capsule
        ? { focus: null, capsule: { ...state.capsule, note } }
        : state,
    ),
}))
