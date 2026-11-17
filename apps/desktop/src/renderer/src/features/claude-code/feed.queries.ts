import { useRef, useState, useCallback } from 'react'

import type { ConversationFeed } from '@shared/claude-feed'
import { useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { QUERY_KEYS } from '../../state/query-keys'

/**
 * Страница ранней истории («load earlier messages»): главный процесс ставит сообщения
 * выше загруженного и отвечает лентой целиком - она ложится в кэш. pages - сколько
 * страниц уже пришло: по нему лента держит место чтения. Второе нажатие, пока страница
 * едет, ничего не просит: помнит об этом ref, а не состояние - два нажатия до перерисовки
 * видели бы одно и то же «не грузится».
 */
export const useLoadEarlier = (conversationId: string) => {
  const queryClient = useQueryClient()
  const inFlight = useRef(false)
  const [pages, setPages] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const accept = useCallback(
    (feed: ConversationFeed) => {
      queryClient.setQueryData<ConversationFeed>(QUERY_KEYS.claudeFeed(conversationId), feed)
      setPages((count) => count + 1)
    },
    [conversationId, queryClient],
  )

  const loadEarlier = useCallback(() => {
    if (inFlight.current) return

    inFlight.current = true
    setIsLoading(true)
    invoke('claude:loadEarlier', { conversationId })
      .then(accept)
      .catch((error: unknown) => console.warn('[claude-code] ранние сообщения не пришли:', error))
      .finally(() => {
        inFlight.current = false
        setIsLoading(false)
      })
  }, [conversationId, accept])

  /**
   * Лента до элемента выше загруженного (закреплённое): страницы главный процесс ставит
   * одним шагом. Ответ - пришедшая лента или null; повторная просьба безвредна - элемент
   * уже на месте, и вторая ничего не тянет.
   */
  const loadThrough = useCallback(
    (itemId: string) =>
      invoke('claude:loadThrough', { conversationId, itemId })
        .then((feed) => {
          accept(feed)

          return feed
        })
        .catch((error: unknown) => {
          console.warn('[claude-code] лента до закреплённого не пришла:', error)

          return null
        }),
    [conversationId, accept],
  )

  return { pages, isLoading, loadEarlier, loadThrough }
}
