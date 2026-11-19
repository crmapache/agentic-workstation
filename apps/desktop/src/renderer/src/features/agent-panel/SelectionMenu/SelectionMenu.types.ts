import type { RefObject } from 'react'

import type { Conversation } from '@shared/conversation'
import type { FeedItem } from '@shared/conversation-feed'

export type SelectionMenuProps = {
  /** Область ленты: меню - только для выделения внутри неё. */
  areaRef: RefObject<HTMLDivElement | null>
  conversation: Conversation
  items: readonly FeedItem[]
}

/** Выделение в ленте: текст, где оно на экране и в какой строке ленты началось. */
export type FeedSelection = {
  text: string
  rect: { top: number; bottom: number; left: number; right: number }
  rowId: string
}
