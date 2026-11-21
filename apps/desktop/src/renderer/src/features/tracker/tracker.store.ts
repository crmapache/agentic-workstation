import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { TrackerCode, TrackerSendCode } from '@shared/tracker'

import type {
  TrackerUndo,
  TrackerDialog,
  TrackerEditor,
  TrackerNotice,
  TrackerSending,
} from './tracker.types'

type TrackerStore = {
  /** Открытая вкладка трекера у каждого проекта IDE - по пути проекта. */
  activeByPath: Record<string, string>
  /** Свёрнутые потоки - по id: переживают закрытие IDE. */
  collapsed: Record<string, true>
  editor: TrackerEditor | null
  sending: TrackerSending | null
  dialog: TrackerDialog | null
  notice: TrackerNotice
  undo: TrackerUndo
  setActive: (projectPath: string, trackerProjectId: string) => void
  toggleFlow: (flowId: string) => void
  edit: (editor: TrackerEditor | null) => void
  /** Открыть окно отправки в очередь (null - закрыть); саму отправку делает useTrackerActions. */
  openSend: (sending: TrackerSending | null) => void
  open: (dialog: TrackerDialog | null) => void
  fail: (code: TrackerCode | TrackerSendCode) => void
  sent: (count: number) => void
  dismiss: () => void
  offerUndo: (undo: TrackerUndo) => void
}

const TRACKER_STORAGE_KEY = 'agentic-workstation.tracker.v1'

/**
 * Интерфейсное состояние трекера: какая вкладка открыта и какие потоки свёрнуты (помнится
 * между запусками), что правится, что отправляется, последний отказ и «Undo» удаления. Доска -
 * в кэше React Query (state/tracker.queries.ts), не здесь.
 */
export const useTrackerStore = create<TrackerStore>()(
  persist(
    (set) => ({
      activeByPath: {},
      collapsed: {},
      editor: null,
      sending: null,
      dialog: null,
      notice: null,
      undo: null,
      setActive: (projectPath, trackerProjectId) =>
        set((state) => ({
          activeByPath: { ...state.activeByPath, [projectPath]: trackerProjectId },
        })),
      toggleFlow: (flowId) =>
        set((state) => {
          const collapsed = { ...state.collapsed }

          if (collapsed[flowId]) delete collapsed[flowId]
          else collapsed[flowId] = true

          return { collapsed }
        }),
      edit: (editor) => set({ editor }),
      openSend: (sending) => set({ sending }),
      open: (dialog) => set({ dialog }),
      fail: (code) => set({ notice: { kind: 'failed', code } }),
      sent: (count) => set({ notice: { kind: 'sent', count } }),
      dismiss: () => set({ notice: null }),
      offerUndo: (undo) => set({ undo }),
    }),
    {
      name: TRACKER_STORAGE_KEY,
      partialize: ({ activeByPath, collapsed }) => ({ activeByPath, collapsed }),
    },
  ),
)
