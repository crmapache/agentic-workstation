import type { ForkOrigin, Conversation } from '@shared/conversation'

import { forkIn } from '../client/acp-fork-in'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { acpOf } from './acp-conversation'

/**
 * Форк разговора ACP (ADR 0092): только целиком (`session/fork` у Kimi) - с хода ACP не режет,
 * и панель предлагает лишь «весь разговор» (capabilities.forkAtMessage). У разговора Kimi один
 * писатель (замок между процессами, замерено на 2.7.0: чужой процесс получает «session is in use
 * by another Kimi Code CLI instance»): живую сессию форкает её же процесс, спящую - каталог.
 * Форк там же закрывается, и вкладка форка продолжает его своим процессом (`session/resume`).
 * origin.at - сколько сообщений человека было у источника: по нему шов встаёт в повторе на место.
 */
export const forkAcpSession = async (
  runtime: ConversationRuntime,
  source: Conversation,
  beforeMessageId: string | null,
  forkIdle: (sessionId: string, projectPath: string) => Promise<string | null>,
): Promise<{ sessionId: string; origin: ForkOrigin | null }> => {
  if (beforeMessageId !== null) throw new Error('ACP: форка с хода нет')
  // Источник ещё ничего не начал - форку не от чего идти: вкладка начнёт новый разговор.
  if (!source.sessionId) return { sessionId: '', origin: null }

  const kit = acpOf(runtime)

  await runtime.loadFeed()

  const live = kit.live?.isAlive && kit.live.sessionId ? kit.live : null
  const forkedId = live
    ? await forkIn(live.process, source.sessionId, source.projectPath)
    : await forkIdle(source.sessionId, source.projectPath)

  if (!forkedId) throw new Error('ACP: агент не сделал форк')

  const messages = kit.feed.builder.items.filter((item) => item.kind === 'user').length

  return {
    sessionId: forkedId,
    origin: { sourceSessionId: source.sessionId, sourceTitle: source.title, at: String(messages) },
  }
}
