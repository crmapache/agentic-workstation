import { SEEN_RUN_STATES } from '@agentic-workstation/remote-protocol/commands'
import type {
  ConversationStatus,
  ConversationSummary,
} from '@agentic-workstation/remote-protocol/wire-types'
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

/**
 * Значок разговора: идёт или ждёт - его состояние; свободен - чем кончился последний ход, если
 * не просто «готово»: остановлен, упал с ошибкой, процесс сломался. Ключ - в i18n.
 */
export const conversationBadge = (
  conversation: Pick<ConversationSummary, 'status' | 'outcome'>,
): { tone: BadgeTone; key: string } => {
  if (conversation.status !== 'idle') {
    return { tone: CONVERSATION_TONES[conversation.status], key: `status.${conversation.status}` }
  }

  switch (conversation.outcome) {
    case 'interrupted':
      return { tone: 'neutral', key: 'outcome.interrupted' }
    case 'failed':
      return { tone: 'danger', key: 'outcome.failed' }
    case 'crashed':
      return { tone: 'danger', key: 'outcome.crashed' }
    default:
      return { tone: CONVERSATION_TONES.idle, key: 'status.idle' }
  }
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

export type SeenRunState = (typeof SEEN_RUN_STATES)[number]

/**
 * Для какого состояния нарисована кнопка прогона - едет с командой: IDE отказывает (runMoved),
 * если прогон с тех пор встал на паузу или с неё сошёл. Кончившийся прогон кнопок не имеет.
 */
export const seenRunState = (state: string): SeenRunState =>
  SEEN_RUN_STATES.find((known) => known === state) ?? 'running'
