import type { TrackerCard, TrackerGroup } from '@shared/tracker'

export type GroupColumnProps = { group: TrackerGroup; flowId: string }

export type GroupLanesProps = { group: TrackerGroup }

/** Место в столбике продолжений: карточка цепочки задачи или поле её нового продолжения. */
export type LaneSlot =
  | { kind: 'card'; card: TrackerCard; taskId: string; last: boolean }
  | { kind: 'add'; taskId: string }
