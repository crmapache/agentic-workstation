import { useMemo } from 'react'

import type { FeedItem } from '@shared/conversation-feed'

import { selectedStreamOf } from './agents.utils'
import { useConversationFeed } from './panel.queries'
import { useStreamsStore } from './streams.store'
import type { SelectedStream } from './streams.types'

const NO_ITEMS: readonly FeedItem[] = []

/**
 * Что разговор показывает вместо ленты: поток агента или окно агента флота; null -
 * выбран main, видна лента. Сверяется с лентой: агент, которого откат убрал, не держит
 * экран пустым.
 */
export const useSelectedStream = (conversationId: string): SelectedStream | null => {
  const selection = useStreamsStore((state) => state.byConversation[conversationId])
  const items = useConversationFeed(conversationId).data?.items ?? NO_ITEMS

  return useMemo(() => selectedStreamOf(selection, items), [selection, items])
}
