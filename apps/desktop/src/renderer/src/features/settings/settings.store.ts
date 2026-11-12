import { create } from 'zustand'

import type { SettingsSection } from './settings.types'

type SettingsStore = {
  isOpen: boolean
  /** Раздел, открытый в окне: следующее открытие начинается с него же. */
  section: SettingsSection
  open: () => void
  close: () => void
  showSection: (section: SettingsSection) => void
}

/**
 * Открыт ли экран настроек IDE и на каком разделе. Открывают его меню программы (⌘,), поиск
 * везде и шестерёнка внизу левой полосы, а рисует workbench - поэтому состояние не внутри окна.
 */
export const useSettingsStore = create<SettingsStore>()((set) => ({
  isOpen: false,
  section: 'appearance',
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  showSection: (section) => set({ section }),
}))
