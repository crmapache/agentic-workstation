import type { TrackerCard, TrackerBoard } from '@shared/tracker'

import type { TrackerSending } from '../tracker.types'

export type SendModalProps = {
  sending: TrackerSending
  /** Доска: что уйдёт, зависит и от выбранной очереди (пометки, уже стоявшие в ней, не идут). */
  board: TrackerBoard
}

export type CardListProps = {
  sending: TrackerSending
  /** Карточки, которые уйдут, по порядку доски; без сценария - пометками. */
  cards: readonly TrackerCard[]
  /** Заголовок группы (или карточки) - подпись над списком. */
  title: string
}

export type CardRowProps = { card: TrackerCard; index: number }

export type FolderTurnProps = {
  /** Кого новая очередь будет ждать - именами одной строкой. */
  names: string
  /** Очередь, что держит папку на недоделанном (сама она папку не отпустит); null - таких нет. */
  unfinished: string | null
  alongside: boolean
  onAlongside: (alongside: boolean) => void
}
