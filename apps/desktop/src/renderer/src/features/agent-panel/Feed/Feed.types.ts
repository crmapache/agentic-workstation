import type { Conversation } from '@shared/conversation'
import type { FeedItem } from '@shared/conversation-feed'

import type { FeedRow } from '../panel.types'

export type FeedProps = {
  conversation: Conversation
  items: readonly FeedItem[]
}

export type FeedRowViewProps = {
  row: FeedRow
}

/**
 * Как строка отступает от соседей: блок (сообщение, ответ, карточка) - на общем расстоянии
 * ленты, строка журнала (вызовы, агенты, мысли, итог хода) - тесно, как пункт списка.
 */
export type RowRhythm = 'line' | 'block'

/**
 * Место внутри строки, к которому прыжок (слова цитаты в длинном ответе), - по самой строке
 * в DOM. Нашлось - в кадр встаёт оно, а не верх строки; null - верх строки.
 */
export type RowSpot = (row: Element) => Range | null

/** Строка статуса: слова и цифры рядом с ними (пусто - цифр нет). */
export type StatusParts = { label: string; detail: string }

export type WorkingLineProps = {
  conversation: Conversation
  items: readonly FeedItem[]
}

export type JumpButtonProps = {
  /** Сколько строк пришло, пока лента не у низа. */
  unread: number
  onJump: () => void
}

export type EarlierMarkerProps = {
  onLoad: () => void
}
