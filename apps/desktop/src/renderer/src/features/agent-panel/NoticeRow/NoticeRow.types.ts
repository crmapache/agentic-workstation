import type { ReactNode } from 'react'

import type {
  LimitFeedItem,
  RetryFeedItem,
  NoticeFeedItem,
  CompactFeedItem,
  ModelSwitchFeedItem,
} from '@shared/conversation-feed'

/** Служебная строка ленты: отметка, компакт, повтор, смена модели, лимит. */
export type ServiceItem =
  NoticeFeedItem | CompactFeedItem | RetryFeedItem | ModelSwitchFeedItem | LimitFeedItem

export type NoticeRowProps = {
  item: ServiceItem
}

export type LabelRowProps = {
  /** Подпись капсом слева: CONTEXT, RETRY, MODEL… */
  label: string
  /** Идёт: подпись «дышит». */
  pending?: boolean | undefined
  tone?: 'neutral' | 'warning' | 'danger' | undefined
  /** Справа: время, кнопка. */
  aside?: ReactNode
  children: ReactNode
}

export type CheckpointRowProps = {
  /** Короткий чип отметки: CLEAR, REWIND, FORK, EARLIER. */
  chip: string
  children: ReactNode
  /** Отметка - кнопка («load earlier messages»). */
  onClick?: (() => void) | undefined
}

export type NoticeItemProps = { item: NoticeFeedItem }

export type CompactRowProps = { item: CompactFeedItem }

export type RetryRowProps = { item: RetryFeedItem }

export type LimitRowProps = { item: LimitFeedItem }

export type SessionFieldProps = {
  name: string
  note?: string | undefined
  value: string
}
