import type {
  QueueItem,
  ScenarioQueue,
  QueueHoldReason,
  ScenarioQueuesView,
} from '@shared/scenario-queues'
import type { RunState, RunSummary } from '@shared/scenario-runs'
import { isRunAsking } from '@shared/scenario-runs'

import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

import type { RoadMood } from './ScenarioRoadmap/ScenarioRoadmap.types'

/**
 * Очереди на экране: что очередь делает сейчас (по самой очереди и сводке её идущего прогона),
 * какой у этого тон, чьи они и что сказать окну запуска о соседях в той же папке. Всё здесь - арифметика без React: проверяется тестом.
 */

/** Что очередь делает сейчас - одно слово для метки и тона. */
export type QueueStatus =
  | { kind: 'running' }
  | { kind: 'paused' }
  /** Идущий прогон ждёт человека: вопрос или разрешение. */
  | { kind: 'asking' }
  | { kind: 'held'; reason: QueueHoldReason }
  | { kind: 'idle' }
  /** Закрыта человеком, но её worktree ещё живёт - карточка ради него. */
  | { kind: 'closed' }

/** Элемент, который идёт сейчас; в очереди он один или его нет. */
export const runningItemOf = (queue: ScenarioQueue): QueueItem | null =>
  queue.items.find((item) => item.state === 'running') ?? null

/**
 * Сводка идущего прогона очереди. Сначала по runId идущего элемента; пока главный процесс
 * не прислал его (элемент только стартовал), - любой живой прогон с этой очередью.
 */
export const liveOf = (
  queue: ScenarioQueue,
  live: readonly RunSummary[],
): RunSummary | undefined => {
  const runId = runningItemOf(queue)?.runId

  return (
    (runId ? live.find((run) => run.id === runId) : undefined) ??
    live.find((run) => run.queueId === queue.id)
  )
}

/**
 * Состояние очереди. Идущий элемент главнее остановки: остановка ставится, только когда
 * элемент кончился, и пока что-то идёт, её нет. Пауза поверх вопроса - вопрос: на него можно
 * ответить, и это то, что человек должен увидеть.
 */
export const queueStatus = (queue: ScenarioQueue, live: RunSummary | undefined): QueueStatus => {
  if (queue.closedAt > 0) return { kind: 'closed' }
  if (runningItemOf(queue)) {
    if (live && isRunAsking(live)) return { kind: 'asking' }

    return live?.state === 'paused' ? { kind: 'paused' } : { kind: 'running' }
  }

  return queue.hold ? { kind: 'held', reason: queue.hold.reason } : { kind: 'idle' }
}

/**
 * Тон состояния - смыслом (ADR 0006), как у плашки прогона: идёт - жёлтый, ждёт человека -
 * оранжевый, провал и отказ - красный, всё, что поставил сам человек, - серый.
 */
export const statusTone = (status: QueueStatus): BadgeTone => {
  switch (status.kind) {
    case 'running':
      return 'warning'
    case 'asking':
      return 'accent'
    case 'held':
      return status.reason === 'failed' || status.reason === 'refused' ? 'danger' : 'neutral'
    case 'paused':
    case 'idle':
    case 'closed':
      return 'neutral'
  }
}

/** Что делает дорога карточек: работает, ждёт ответа, стоит на паузе. */
export const roadMood = (state: RunState): RoadMood => {
  if (state === 'blocked') return 'asking'

  return state === 'paused' ? 'paused' : 'working'
}

/** Ждущие элементы по порядку: двигать можно только среди них. */
export const waitingItems = (queue: ScenarioQueue): QueueItem[] =>
  queue.items.filter((item) => item.state === 'waiting')

/** Элемент, на котором очередь встала; нет остановки или элемент убран - null. */
export const holdItemOf = (queue: ScenarioQueue): QueueItem | null =>
  (queue.hold && queue.items.find((item) => item.id === queue.hold?.itemId)) || null

/** Очереди одного проекта: вид сценариев показывает только их (ADR 0072). */
export const projectQueues = (
  view: Pick<ScenarioQueuesView, 'queues'> | undefined,
  projectPath: string,
): ScenarioQueue[] => view?.queues.filter((queue) => queue.projectPath === projectPath) ?? []

/**
 * Другие очереди проекта, что работают прямо в его папке и ещё не кончили: новая очередь без
 * worktree правила бы те же файлы - окно запуска предупреждает.
 */
export const folderNeighbours = (
  queues: readonly ScenarioQueue[],
  projectPath: string,
): ScenarioQueue[] =>
  queues.filter(
    (queue) =>
      queue.projectPath === projectPath &&
      queue.workdir.kind === 'project' &&
      queue.items.some((item) => item.state === 'running' || item.state === 'waiting'),
  )
