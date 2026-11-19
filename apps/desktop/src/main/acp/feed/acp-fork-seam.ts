import type { ForkOrigin } from '@shared/conversation'
import type { FeedItem } from '@shared/conversation-feed'

/**
 * Повтор форка со швом: после сообщений, которые были у источника (origin.at), - строка «новая
 * ветка от ...». ACP повторяет историю целиком, и где кончился источник, знает только IDE.
 */
export const withForkSeam = (items: readonly FeedItem[], fork: ForkOrigin | null): FeedItem[] => {
  const inherited = Number(fork?.at)

  if (!fork || !Number.isInteger(inherited) || inherited <= 0) return [...items]

  let seen = 0
  const at = items.findIndex((item) => item.kind === 'user' && ++seen > inherited)
  const cut = at < 0 ? items.length : at
  const seam: FeedItem = {
    kind: 'notice',
    id: 'p1-fork-seam',
    parentToolUseId: null,
    code: 'forked',
    detail: fork.sourceTitle,
    replayed: true,
    sourceSessionId: fork.sourceSessionId,
  }

  return [...items.slice(0, cut), seam, ...items.slice(cut)]
}
