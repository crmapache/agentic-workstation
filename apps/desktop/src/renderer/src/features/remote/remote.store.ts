import { create } from 'zustand'

type RemoteStore = {
  isOpen: boolean
  open: () => void
  close: () => void
}

/**
 * Открыто ли окно Remote Control. Открывают его кнопка в строке состояния и поиск везде, а
 * рисует workbench - поэтому состояние не внутри окна.
 */
export const useRemoteStore = create<RemoteStore>()((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
