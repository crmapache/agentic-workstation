import type { PairFailure } from '../../../remote/pairing'

/** ready - ключи готовы, ждём «Pair»; waiting - ждём Approve в IDE; failed - что не так. */
export type PairingPhase =
  | { kind: 'preparing' }
  | { kind: 'ready' }
  | { kind: 'waiting' }
  | { kind: 'failed'; reason: PairFailure }

export type DeviceKind = 'iphone' | 'ipad' | 'android' | 'other'
