import type { PermissionMode } from '@shared/conversation'
import { PERMISSION_MODES } from '@shared/conversation'

/**
 * Режим сценария или задания (слова Claude Code в файле) - режимом панели провайдера: старое
 * `manual` и незнакомое - «спрашивать», чтобы чужое слово не дало больше свободы, чем просили.
 */
export const runModeOf = (value: string): PermissionMode =>
  PERMISSION_MODES.find((mode) => mode === value) ?? (value === 'readOnly' ? 'readOnly' : 'default')
