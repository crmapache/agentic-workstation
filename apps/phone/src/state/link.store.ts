import { create } from 'zustand'

import type { LinkStatus } from '../remote/machine-session'
import type { SocketState } from '../remote/relay-socket'

type LinkState = {
  /** Связь с каждой IDE по её адресу. */
  statuses: Record<string, LinkStatus>
  /** Линия до релея этой страницы. */
  relay: SocketState
  setStatus: (agentId: string, status: LinkStatus) => void
  setRelay: (relay: SocketState) => void
}

/**
 * Состояние линий - не данные IDE, а то, как телефон до неё дозванивается; его меняет ядро
 * (state/mirror.ts), читают шапки и списки.
 */
export const useLinkStore = create<LinkState>((set) => ({
  statuses: {},
  relay: 'idle',
  setStatus: (agentId, status) =>
    set((state) => ({ statuses: { ...state.statuses, [agentId]: status } })),
  setRelay: (relay) => set({ relay }),
}))
