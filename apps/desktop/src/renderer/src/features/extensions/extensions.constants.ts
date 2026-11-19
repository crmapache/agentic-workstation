import type { PermissionRisk, ExtensionStatus } from '@shared/extensions'

import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

/** Тон статуса расширения на плитке и в окне. */
export const STATUS_TONES: Record<ExtensionStatus, BadgeTone> = {
  starting: 'info',
  running: 'success',
  stopped: 'neutral',
  disabled: 'neutral',
  needsApproval: 'warning',
  failed: 'danger',
  invalid: 'danger',
}

/** Тон риска права: высокий - красным, средний - жёлтым. */
export const RISK_TONES: Record<PermissionRisk, BadgeTone> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
}
