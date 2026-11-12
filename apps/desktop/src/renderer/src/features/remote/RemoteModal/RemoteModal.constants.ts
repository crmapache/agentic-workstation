import type { RemoteLinkState } from '@shared/remote'

import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

/** Тон состояния связи: зелёный - в порядке, оранжевый - лечится само, красный - нужен человек. */
export const LINK_TONES: Readonly<Record<RemoteLinkState, BadgeTone>> = {
  off: 'neutral',
  connecting: 'warning',
  connected: 'success',
  reconnecting: 'warning',
  relayDown: 'warning',
  displaced: 'danger',
  refused: 'danger',
}

/** Клетка QR в точках SVG и тихая зона в клетках: код читается камерой с экрана ноутбука. */
export const QR_CELL = 4

export const QR_MARGIN = 4

/** Отсчёт кода пары - раз в секунду. */
export const COUNTDOWN_MS = 1000
