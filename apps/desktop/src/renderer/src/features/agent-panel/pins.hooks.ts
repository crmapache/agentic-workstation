import { useRef, useCallback, useLayoutEffect } from 'react'

import type { FeedItem, ConversationFeed } from '@shared/conversation-feed'

type LoadThrough = (itemId: string) => Promise<ConversationFeed | null>

/**
 * Прыжок к закреплённому с полки. Загруженное - сразу; выше загруженного - сначала главный
 * процесс дотягивает ленту до него, потом прыжок, когда строка встала (до отрисовки, как у
 * находки поиска). Не нашлось и там - прыгать некуда: закреп снимет сама полка.
 */
export const usePinJump = (
  items: readonly FeedItem[],
  goToRow: (rowId: string) => void,
  loadThrough: LoadThrough,
) => {
  const target = useRef<string | null>(null)

  useLayoutEffect(() => {
    const itemId = target.current

    if (!itemId || !items.some((item) => item.id === itemId)) return

    target.current = null
    goToRow(itemId)
  }, [items, goToRow])

  return useCallback(
    (itemId: string) => {
      if (items.some((item) => item.id === itemId)) return goToRow(itemId)

      target.current = itemId
      void loadThrough(itemId).then((feed) => {
        const arrived = feed?.items.some((item) => item.id === itemId) ?? false

        if (!arrived && target.current === itemId) target.current = null
      })
    },
    [items, goToRow, loadThrough],
  )
}
