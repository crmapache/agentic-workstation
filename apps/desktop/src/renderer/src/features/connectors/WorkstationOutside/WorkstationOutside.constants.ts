import type { OutsideStatus } from '@shared/connectors'

import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

/** Тон состояния входа снаружи: слушает - в порядке, порт занят - внимание, не поднялся - ошибка. */
export const OUTSIDE_TONES: Record<OutsideStatus, BadgeTone> = {
  off: 'neutral',
  on: 'success',
  'port-busy': 'warning',
  failed: 'danger',
}
