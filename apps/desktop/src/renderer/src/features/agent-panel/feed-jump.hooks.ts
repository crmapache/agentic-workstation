import { useRef, useCallback, useLayoutEffect } from 'react'

import type { FeedItem, ConversationFeed } from '@shared/conversation-feed'
import type { DraftChip } from '@shared/message-draft'

import { rowIdOfItem } from './feed-rows.utils'
import type { QuoteJump } from './feed-scope.context'
import { flashQuote, quoteRange } from './feed-text'
import { quoteSource } from './message.utils'
import type { FeedRow } from './panel.types'
import type { RowSpot } from './Feed/Feed.types'

type LoadThrough = (itemId: string) => Promise<ConversationFeed | null>

type GoToRow = (rowId: string, spot?: RowSpot) => void

type ItemJump = (itemId: string, spot?: RowSpot) => void

/** Строка загруженного элемента - к ней прыжок; элемент без своей строки (скрытый) - мимо. */
const goToItem = (rows: readonly FeedRow[], itemId: string, goToRow: GoToRow, spot?: RowSpot) => {
  const rowId = rowIdOfItem(rows, itemId)

  if (rowId) goToRow(rowId, spot)
}

/**
 * Прыжок к элементу ленты: закреп с полки, место цитаты. Загруженное - сразу, к строке, где
 * он стоит (вызов - в группе, мысль - в карточке мыслей). Выше загруженного - сначала
 * главный процесс дотягивает ленту до него, потом прыжок, когда строка встала (до
 * отрисовки, как у находки поиска). Не нашлось и там - прыгать некуда.
 */
export const useItemJump = (
  items: readonly FeedItem[],
  rows: readonly FeedRow[],
  goToRow: GoToRow,
  loadThrough: LoadThrough,
): ItemJump => {
  const target = useRef<{ itemId: string; spot?: RowSpot | undefined } | null>(null)

  useLayoutEffect(() => {
    const waiting = target.current

    if (!waiting || !items.some((item) => item.id === waiting.itemId)) return

    target.current = null
    goToItem(rows, waiting.itemId, goToRow, waiting.spot)
  }, [items, rows, goToRow])

  return useCallback(
    (itemId: string, spot?: RowSpot) => {
      if (items.some((item) => item.id === itemId)) return goToItem(rows, itemId, goToRow, spot)

      const waiting = { itemId, spot }

      target.current = waiting
      void loadThrough(itemId).then((feed) => {
        const arrived = feed?.items.some((item) => item.id === itemId) ?? false

        if (!arrived && target.current === waiting) target.current = null
      })
    },
    [items, rows, goToRow, loadThrough],
  )
}

/**
 * Прыжок от чипа цитаты к месту, откуда её взяли (quoteSource): в кадр встают сами её слова
 * и на миг подсвечены, а не только верх длинного ответа. Ответ один на всю жизнь ленты: он
 * едет строкам контекстом, и новый на каждом патче перерисовывал бы все сообщения. Свежие
 * лента и прыжок к элементу - из ref, обновлённого после отрисовки.
 */
export const useQuoteJump = (items: readonly FeedItem[], jumpToItem: ItemJump): QuoteJump => {
  const latest = useRef({ items, jumpToItem })

  useLayoutEffect(() => {
    latest.current = { items, jumpToItem }
  }, [items, jumpToItem])

  return useCallback((messageId: string, chip: DraftChip) => {
    const current = latest.current
    const itemId = quoteSource(current.items, messageId, chip)
    const spot: RowSpot = (row) => {
      const range = quoteRange(row, chip.text ?? '')

      if (range) flashQuote(range)

      return range
    }

    if (itemId) current.jumpToItem(itemId, spot)
  }, [])
}
