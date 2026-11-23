import type { TrackerCard } from '@shared/tracker'

export type CardTileProps = {
  card: TrackerCard
  groupId: string
  /** Продолжение задачи (стоит в цепочке справа), а не задача группы. */
  followUp: boolean
  /** Задача цепочки: к ней добавляются продолжения. */
  rootId: string
  /** Последняя карточка цепочки: «+» под рукой открывает поле следующего продолжения. */
  onAddFollowUp?: (() => void) | undefined
}

export type CardMetaProps = { card: TrackerCard; today: number }

/** Что меню «⋯» знает о карточке: её саму, группу, ось сдвига и задачу цепочки. */
export type CardMenuArgs = Pick<CardTileProps, 'card' | 'groupId' | 'followUp' | 'rootId'>
