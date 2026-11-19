import { useMemo, useEffect } from 'react'

import type { FeedItem } from '@shared/conversation-feed'
import { useQuery, keepPreviousData } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { usePanelProvider } from '../../state/panel-provider.context'
import { QUERY_KEYS } from '../../state/query-keys'
import { usePins, usePinsStore } from './pins.store'
import type { PinnedItem } from './pins.utils'
import { gonePins, shelfItems, unloadedPins } from './pins.utils'

/**
 * Полка закреплённых разговора. Лента открывается последней страницей, а закреплённое могло
 * остаться выше: его главный процесс находит в транскрипте сам, без страниц. Закреп, которого
 * нет нигде в разговоре (откат, /clear), снимается - иначе он невидимо держал бы место, и
 * закрепить новое было бы нельзя. Найденное выше со временем не меняется: ответ не устаревает,
 * а пока едет следующий, на полке прежний (keepPreviousData) - она не мигает.
 */
export const usePinnedShelf = (
  conversationId: string,
  items: readonly FeedItem[],
): PinnedItem[] => {
  const provider = usePanelProvider()
  const pins = usePins(conversationId)
  const unpin = usePinsStore((store) => store.unpin)
  const unloaded = useMemo(() => unloadedPins(items, pins), [items, pins])
  const { data, isPlaceholderData } = useQuery({
    queryKey: QUERY_KEYS.agentFeedItems(provider, conversationId, unloaded),
    queryFn: () => invoke('agent:feedItems', { provider, conversationId, itemIds: unloaded }),
    enabled: unloaded.length > 0,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  })
  const found = data ?? null
  // Судить можно только по ответу на свой вопрос, а не по прежнему, оставленному на экране.
  const gone = found && !isPlaceholderData ? gonePins(unloaded, found).join('\n') : ''

  useEffect(() => {
    if (gone) unpin(conversationId, gone.split('\n'))
  }, [gone, unpin, conversationId])

  return useMemo(() => shelfItems(items, pins, found), [items, pins, found])
}
