import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

/**
 * Тон состояния - смыслом (ADR 0006): работает - жёлтый, ждёт человека - оранжевый, готово -
 * зелёный, упало - красный, стоит рукой человека - серый.
 */
export const STATE_TONES: Record<string, BadgeTone> = {
  starting: 'warning',
  running: 'warning',
  judging: 'warning',
  asking: 'accent',
  blocked: 'accent',
  paused: 'neutral',
  waiting: 'neutral',
  done: 'success',
  failed: 'danger',
  stopped: 'neutral',
  skipped: 'neutral',
}
