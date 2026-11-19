import type { PointerEvent } from 'react'

import type { Conversation, QueuedMessage } from '@shared/conversation'
import type { DraftChip } from '@shared/message-draft'

import type { PictureSource } from '../picture.types'

export type QueueListProps = {
  conversation: Conversation
}

export type QueueRowProps = {
  item: QueuedMessage
  index: number
  /** Сообщение уже вынуто в поле: второе в поле заменило бы первое - стрелки погашены. */
  isEditing: boolean
  isDragging: boolean
  isOver: boolean
  onGrab: (event: PointerEvent<HTMLElement>) => void
  onTakeOut: () => void
  onSendNow: () => void
  onRemove: () => void
  rowRef: (row: HTMLDivElement | null) => void
  /** Разговор очереди: картинка без файла берётся из его очереди в главном процессе. */
  conversationId: string
  onOpenPicture: (source: PictureSource, chip: DraftChip) => void
}

export type QueueLineProps = {
  item: QueuedMessage
  conversationId: string
  /** Клик по картинке открывает её крупно. */
  onOpenPicture: (source: PictureSource, chip: DraftChip) => void
}

/** Открытая крупно картинка очереди и что на ней. */
export type OpenedPicture = { source: PictureSource; label: string }
