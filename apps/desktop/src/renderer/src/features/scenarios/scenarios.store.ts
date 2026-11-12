import { create } from 'zustand'

import type { ScenarioCode } from '@shared/scenarios'

import type { ScenariosTab, ScenariosModal, ScenarioNoticeState } from './scenarios.types'

type ScenariosStore = {
  tab: ScenariosTab
  modal: ScenariosModal | null
  notice: ScenarioNoticeState
  setTab: (tab: ScenariosTab) => void
  open: (modal: ScenariosModal) => void
  close: () => void
  fail: (code: ScenarioCode, detail?: string) => void
  dismiss: () => void
}

/**
 * Интерфейсное состояние вида сценариев: вкладка, открытое окно и последний отказ. Данные
 * (очереди, полки, прогоны) - в кэше React Query (state/scenarios.queries.ts), не здесь.
 */
export const useScenariosStore = create<ScenariosStore>((set) => ({
  tab: 'library',
  modal: null,
  notice: null,
  setTab: (tab) => set({ tab }),
  open: (modal) => set({ modal }),
  close: () => set({ modal: null }),
  fail: (code, detail = '') => set({ notice: { code, detail } }),
  dismiss: () => set({ notice: null }),
}))
