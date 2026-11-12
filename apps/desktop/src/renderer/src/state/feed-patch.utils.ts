import type { FeedItem, FeedPatch, ConversationFeed } from '@shared/claude-feed'

/**
 * Патч главного процесса поверх ленты из кэша: убранные откатом уходят, новые элементы
 * встают в конец, тронутые - на своё место. Список задач приходит целиком, когда
 * поменялся. Общий у ленты панели Claude Code и разговоров ИИ о коннекторах.
 */
export const applyFeedPatch = (feed: ConversationFeed, patch: FeedPatch): ConversationFeed => {
  const removed = new Set(patch.removes ?? [])
  const items: FeedItem[] = feed.items.filter((item) => !removed.has(item.id))
  const positions = new Map(items.map((item, index) => [item.id, index]))

  for (const item of patch.upserts) {
    const position = positions.get(item.id)

    if (position === undefined) {
      positions.set(item.id, items.length)
      items.push(item)
    } else {
      items[position] = item
    }
  }

  return {
    ...feed,
    items,
    tasks: patch.tasks ?? feed.tasks,
    hasEarlier: patch.hasEarlier ?? feed.hasEarlier,
  }
}
