import type { ForkOrigin, Conversation } from '@shared/conversation'

import type { OpenCodeCatalog } from '../catalog/opencode-catalog'
import { inheritedPrefix } from '../feed/opencode-replay'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { openCodeOf } from './opencode-conversation'

/**
 * Форк OpenCode: сессия-копия до сообщения (beforeMessageId null - разговор целиком) создаётся
 * сразу (`fork`, база разговоров общая). Шов в ленте - после унаследованных сообщений: у
 * форка они получают общее начало id (замерено на 2.3.2), оно и едет в origin.at. Унаследовать
 * нечего (у источника нет сессии) - новая вкладка.
 */
export const forkOpenCode = async (
  catalog: OpenCodeCatalog,
  runtime: ConversationRuntime,
  source: Conversation,
  beforeMessageId: string | null,
): Promise<{ sessionId: string; origin: ForkOrigin | null }> => {
  if (!source.sessionId) return { sessionId: '', origin: null }

  const before = beforeMessageId && openCodeOf(runtime).feed.openCodeIdOf(beforeMessageId)
  const sessionId = await catalog.fork(source.sessionId, before || null)

  if (!sessionId) throw new Error('opencode: форк не создан')

  const first = (await catalog.messages(sessionId, null)).messages[0]
  const firstId = typeof first?.['id'] === 'string' ? first['id'] : ''

  return {
    sessionId,
    origin: firstId
      ? {
          sourceSessionId: source.sessionId,
          sourceTitle: source.title,
          at: inheritedPrefix(firstId),
        }
      : null,
  }
}
