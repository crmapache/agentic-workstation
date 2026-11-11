import { create } from 'zustand'

import type { PushStatus } from '../push/push-setup'

type PushState = {
  /** Что с уведомлениями на этом телефоне - его меняет PushSetup (lib/push.ts). */
  status: PushStatus
  setStatus: (status: PushStatus) => void
}

/** Уведомления - состояние телефона, а не IDE: держит Zustand, читает экран машин. */
export const usePushStore = create<PushState>((set) => ({
  status: 'checking',
  setStatus: (status) => set({ status }),
}))
