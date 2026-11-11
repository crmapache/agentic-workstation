import type { ConversationStatus } from '@agentic-workstation/remote-protocol/wire-types'
import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

/**
 * Тона состояний - как точка вкладки в IDE: работа - жёлтый, ждёт человека - оранжевый
 * (внимание), свободен - серый, сделано - зелёный, сломалось - красный.
 */
export const CONVERSATION_TONES: Record<ConversationStatus, BadgeTone> = {
  running: 'warning',
  'waiting-for-you': 'accent',
  idle: 'neutral',
}

export const QUEUE_ITEM_TONES: Record<string, BadgeTone> = {
  waiting: 'neutral',
  running: 'warning',
  done: 'success',
  failed: 'danger',
  stopped: 'neutral',
}

export const RUN_TONES: Record<string, BadgeTone> = {
  starting: 'warning',
  running: 'warning',
  paused: 'neutral',
  blocked: 'accent',
  done: 'success',
  failed: 'danger',
  stopped: 'neutral',
}

export const STEP_TONES: Record<string, BadgeTone> = {
  waiting: 'neutral',
  running: 'warning',
  asking: 'accent',
  judging: 'warning',
  paused: 'neutral',
  done: 'success',
  failed: 'danger',
  skipped: 'neutral',
}

/** Прогон кончился - кнопок управления у него нет. */
export const isRunOver = (state: string): boolean =>
  state === 'done' || state === 'failed' || state === 'stopped'
