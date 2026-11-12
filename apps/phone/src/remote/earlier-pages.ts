import type { FeedPageWire } from '@agentic-workstation/remote-protocol/wire-types'

import type { CommandOutcome } from './command-desk'
import type { RemoteClient } from './remote-client'

/**
 * Страница ленты выше того, что у телефона: от самого раннего его элемента (conversation.earlier)
 * и перед лентой - если та за это время не сменилась снимком (prependFeedPage). Итог - data:
 * true, страница встала; false - ленту сменил снимок, и страница не к ней. Ленты нет - notFound:
 * просить не от чего.
 */
export const loadEarlierPage = async (
  client: RemoteClient,
  agentId: string,
  conversationId: string,
): Promise<CommandOutcome> => {
  const before = client.watches.feedOf(agentId, conversationId)?.items[0]?.id

  if (!before) return { ok: false, code: 'notFound' }

  const outcome = await client.command(agentId, 'conversation.earlier', { conversationId, before })

  if (!outcome.ok) return outcome

  const page = outcome.data as FeedPageWire

  return { ok: true, data: client.watches.prepend(agentId, conversationId, before, page) }
}
