import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

/** Тон состояния коннектора: подключён - зелёный, нужен вход - внимание, сбой - красный. */
export const CONNECTOR_TONES: Record<string, BadgeTone> = {
  connected: 'success',
  'signed-out': 'accent',
  'signing-in': 'warning',
  failed: 'danger',
  disabled: 'neutral',
}
