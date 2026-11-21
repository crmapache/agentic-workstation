import type { TrackerCard } from '@shared/tracker'

export type CardTileProps = {
  card: TrackerCard
  groupId: string
  /** Продолжение задачи (стоит в цепочке справа), а не задача группы. */
  followUp: boolean
  /** Задача цепочки: к ней добавляются продолжения. */
  rootId: string
}

export type CardMetaProps = { card: TrackerCard; today: number }
