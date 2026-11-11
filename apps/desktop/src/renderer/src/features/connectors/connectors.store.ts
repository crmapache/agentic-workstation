import { create } from 'zustand'

import type { AddTarget, ConnectorsPanel } from './connectors.types'

type ConnectorsStore = {
  panel: ConnectorsPanel | null
  openConnector: (id: string) => void
  openAdd: (target: AddTarget) => void
  openType: (id: string) => void
  close: () => void
}

/**
 * Какой лист открыт на виде Connectors. Отдельно от вида: ушёл на файл и вернулся - лист
 * на месте, как и работа ИИ в главном процессе.
 */
export const useConnectorsStore = create<ConnectorsStore>()((set) => ({
  panel: null,
  openConnector: (id) => set({ panel: { kind: 'connector', id } }),
  openAdd: (target) => set({ panel: { kind: 'add', target } }),
  openType: (id) => set({ panel: { kind: 'type', id } }),
  close: () => set({ panel: null }),
}))
