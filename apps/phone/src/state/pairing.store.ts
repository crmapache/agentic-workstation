import { create } from 'zustand'

import type { TakenCode } from '../lib/pairing-link'

type PairingState = {
  /** Код из открытого QR-адреса - только в памяти страницы, в адресе его уже нет. */
  taken: TakenCode
  take: (taken: TakenCode) => void
  /** Пара кончилась: секрет кода больше не нужен. */
  clear: () => void
}

export const usePairingStore = create<PairingState>((set) => ({
  taken: { kind: 'none' },
  take: (taken) => set({ taken }),
  clear: () => set({ taken: { kind: 'none' } }),
}))
