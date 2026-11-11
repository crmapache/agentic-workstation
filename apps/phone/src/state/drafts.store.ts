import { create } from 'zustand'

type DraftsState = {
  /** Набранное, но не отправленное - по разговору (или прогону): ушёл с экрана - не пропало. */
  drafts: Record<string, string>
  setDraft: (key: string, text: string) => void
}

export const useDraftsStore = create<DraftsState>((set) => ({
  drafts: {},
  setDraft: (key, text) => set((state) => ({ drafts: { ...state.drafts, [key]: text } })),
}))
