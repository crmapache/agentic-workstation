import type { QueueHold, QueueItem, ScenarioQueue } from '@shared/scenario-queues'
import type { RunSummary } from '@shared/scenario-runs'

import type { QueueStatus } from '../scenarios-queues.utils'

export type QueueCardProps = {
  queue: ScenarioQueue
  /** Сводка идущего прогона очереди (liveOf); нет - ничего не идёт или сводка ещё не пришла. */
  live?: RunSummary | undefined
  /** Плотная полоса доски всех очередей: шапка в строку, элементы точками, дорога идущего. */
  compact?: boolean | undefined
  /** Доска: перейти к проекту очереди и его вкладке очередей. */
  onOpen?: (() => void) | undefined
}

export type QueueHeaderProps = {
  queue: ScenarioQueue
  status: QueueStatus
  isRenaming: boolean
  onRenaming: (isRenaming: boolean) => void
}

export type QueueNameProps = Omit<QueueHeaderProps, 'status'>

export type QueueNameFieldProps = { queue: ScenarioQueue; onDone: () => void }

export type QueueBadgesProps = { queue: ScenarioQueue; status: QueueStatus }

export type QueueMenuProps = { queue: ScenarioQueue; onRename: () => void }

export type QueueItemsProps = { queue: ScenarioQueue; live: RunSummary | undefined }

export type QueueItemChipProps = {
  queue: ScenarioQueue
  item: QueueItem
  /** Место в очереди с единицы. */
  number: number
  live: RunSummary | undefined
}

export type QueueItemMenuProps = {
  queue: ScenarioQueue
  item: QueueItem
  /** Первый и последний среди ждущих: выше и ниже двигать некуда. */
  isFirst: boolean
  isLast: boolean
}

export type QueueRunningProps = { queue: ScenarioQueue; live: RunSummary }

export type RunReadingsProps = { live: RunSummary }

export type QueueHoldProps = { queue: ScenarioQueue; hold: QueueHold }

export type QueueControlsProps = { queue: ScenarioQueue; live: RunSummary | undefined }

export type StopRunDialogProps = {
  queue: ScenarioQueue
  item: QueueItem
  runId: string
  onClose: () => void
}

export type CloseQueueDialogProps = { queue: ScenarioQueue; onClose: () => void }

export type QueueCompactProps = {
  queue: ScenarioQueue
  live: RunSummary | undefined
  status: QueueStatus
  onOpen: (() => void) | undefined
}

export type QueueDotsProps = { queue: ScenarioQueue; live: RunSummary | undefined }
