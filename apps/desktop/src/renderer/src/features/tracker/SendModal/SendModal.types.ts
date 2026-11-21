import type { TrackerCard } from '@shared/tracker'

import type { TrackerSending } from '../tracker.types'

export type SendModalProps = {
  sending: TrackerSending
  /** Карточки, которые уйдут, по порядку доски. */
  cards: readonly TrackerCard[]
  /** Заголовок группы (или карточки) - подпись над списком. */
  title: string
}

export type CardListProps = SendModalProps

export type CardRowProps = { card: TrackerCard; index: number }
