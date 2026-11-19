import { create } from 'zustand'

import type { ExtensionActionError } from '@shared/extensions'

import type { ExtensionsTab, ExtensionsPanel } from './extensions.types'

type ExtensionsStore = {
  tab: ExtensionsTab
  panel: ExtensionsPanel
  /** Отказ последнего действия - строкой в открытом окне. */
  error: ExtensionActionError | null
  setTab: (tab: ExtensionsTab) => void
  open: (panel: ExtensionsPanel) => void
  close: () => void
  fail: (error: ExtensionActionError | null) => void
}

/** Интерфейсное состояние вида Extensions; сами расширения - у главного процесса (ADR 0091). */
export const useExtensionsStore = create<ExtensionsStore>()((set) => ({
  tab: 'installed',
  panel: null,
  error: null,
  setTab: (tab) => set({ tab }),
  open: (panel) => set({ panel, error: null }),
  close: () => set({ panel: null, error: null }),
  fail: (error) => set({ error }),
}))
