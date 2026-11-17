import { create } from 'zustand'

type DraftsState = {
  /** Набранное, но не отправленное - по разговору (или прогону): ушёл с экрана - не пропало. */
  drafts: Record<string, string>
  /** Цитаты из ленты над полем - строками, по тому же ключу; уходят с сообщением сверху. */
  quotes: Record<string, string[]>
  setDraft: (key: string, text: string) => void
  addQuote: (key: string, quote: string) => void
  removeQuote: (key: string, index: number) => void
  /** Ушедшие с сообщением: добавленные, пока оно уходило, остаются. */
  dropQuotes: (key: string, sent: readonly string[]) => void
}

export const useDraftsStore = create<DraftsState>((set) => ({
  drafts: {},
  quotes: {},
  setDraft: (key, text) => set((state) => ({ drafts: { ...state.drafts, [key]: text } })),
  addQuote: (key, quote) =>
    set((state) => ({ quotes: { ...state.quotes, [key]: [...(state.quotes[key] ?? []), quote] } })),
  removeQuote: (key, index) =>
    set((state) => ({
      quotes: {
        ...state.quotes,
        [key]: (state.quotes[key] ?? []).filter((_, at) => at !== index),
      },
    })),
  dropQuotes: (key, sent) =>
    set((state) => ({
      quotes: {
        ...state.quotes,
        [key]: (state.quotes[key] ?? []).slice(sent.length),
      },
    })),
}))
