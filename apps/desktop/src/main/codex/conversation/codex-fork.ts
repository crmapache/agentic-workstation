import type { ForkOrigin, Conversation } from '@shared/conversation'

import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { codexOf } from './codex-conversation'

/**
 * Форк Codex: вкладка с точкой - последним ходом перед сообщением (beforeMessageId null -
 * разговор целиком, по последний законченный ход). Ветку потока (`thread/fork`) создаёт
 * сессия самой вкладки при первом запуске: у потока один писатель, и созданный другим
 * процессом поток вкладка не продолжила бы. До того вкладка показывает источник до точки.
 * Унаследовать нечего (форк до первого сообщения, у источника нет потока) - новая вкладка.
 */
export const forkSessionFor = async (
  runtime: ConversationRuntime,
  source: Conversation,
  beforeMessageId: string | null,
): Promise<{ sessionId: string; origin: ForkOrigin | null }> => {
  const { turns } = codexOf(runtime).feed

  await runtime.loadFeed()

  const through =
    beforeMessageId === null
      ? turns.lastSettled(runtime.turnActive)
      : turns.turnBefore(beforeMessageId)

  if (through === undefined) throw new Error('codex: сообщения нет среди ходов разговора')
  if (!source.sessionId || through === null) return { sessionId: '', origin: null }

  return {
    sessionId: '',
    origin: { sourceSessionId: source.sessionId, sourceTitle: source.title, at: through },
  }
}
