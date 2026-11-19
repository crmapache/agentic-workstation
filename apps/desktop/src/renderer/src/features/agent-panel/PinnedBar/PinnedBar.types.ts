import type { FeedItem } from '@shared/conversation-feed'

import type { PinnedItem } from '../pins.utils'

export type PinnedBarProps = {
  conversationId: string
  /**
   * Загруженная часть ленты: закреплённое из неё полка берёт живым, а что выше - находит
   * главный процесс.
   */
  items: readonly FeedItem[]
  /** Нажали строку: прыжок к самому сообщению, даже выше загруженного. */
  onJump: (itemId: string) => void
  /**
   * Высота полки в пикселях - на каждое её изменение и 0, когда полки нет: лента держит
   * столько запаса сверху, чтобы первые строки не прятались под полкой.
   */
  onHeight?: ((px: number) => void) | undefined
}

export type PinnedRowProps = {
  item: PinnedItem
  onJump: (itemId: string) => void
  onUnpin: (itemId: string) => void
}
