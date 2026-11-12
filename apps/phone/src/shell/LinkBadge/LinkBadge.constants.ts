import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

import type { LinkStatus } from '../../remote/machine-session'

/** Зелёный - «в порядке», жёлтый - «не отвечает», красный - пара больше не действует. */
export const LINK_TONES: Record<LinkStatus, BadgeTone> = {
  online: 'success',
  connecting: 'neutral',
  offline: 'warning',
  revoked: 'danger',
}
