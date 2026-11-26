import type {
  QueueHold,
  QueueItem,
  ScenarioQueue,
  QueueHoldReason,
  ScenarioQueuesView,
} from '@shared/scenario-queues'
import { carryOnItemOf } from '@shared/scenario-queues'
import type { RunState, RunSummary } from '@shared/scenario-runs'
import { isRunAsking } from '@shared/scenario-runs'

import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

import type { RoadMood } from './ScenarioRoadmap/ScenarioRoadmap.types'

/**
 * Очереди на экране: что очередь делает сейчас (по самой очереди, сводке её идущего прогона и
 * ожиданию папки проекта), какой у этого тон и чьи они. Всё здесь - арифметика без React:
 * проверяется тестом.
 */

/** Что очередь делает сейчас - одно слово для метки и тона. */
export type QueueStatus =
  | { kind: 'running' }
  | { kind: 'paused' }
  /** Идущий прогон ждёт человека: вопрос или разрешение. */
  | { kind: 'asking' }
  | { kind: 'held'; reason: QueueHoldReason }
  /** Ждёт своей очереди к папке проекта (ADR 0128): её держит другая очередь без worktree. */
  | { kind: 'inLine' }
  /** Вне рабочих часов (ADR 0074): ждущие стартуют, когда окно откроется. */
  | { kind: 'resting' }
  | { kind: 'idle' }
  /** Закрыта человеком, но её worktree ещё живёт - карточка ради него. */
  | { kind: 'closed' }

/** Ключ слов остановки в `scenarios.queues.hold`: причина или её уточнение по элементу. */
export type HoldWords = QueueHoldReason | 'doneByHand' | 'interruptedDone'

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
 * ответить, и это то, что человек должен увидеть. isInLine - очередь ждёт папку проекта
 * (`folderWaitOf`): так ей нечего начать, пока папку не отпустят.
 */
export const queueStatus = (
  queue: ScenarioQueue,
  live: RunSummary | undefined,
  isInLine = false,
): QueueStatus => {
  if (queue.closedAt > 0) return { kind: 'closed' }
  if (runningItemOf(queue)) {
    if (live && isRunAsking(live)) return { kind: 'asking' }

    return live?.state === 'paused' ? { kind: 'paused' } : { kind: 'running' }
  }

  if (queue.hold) return { kind: 'held', reason: queue.hold.reason }
  // Последний кончился несделанным, ждущих за ним нет: очередь не «свободна» - мимо него она не
  // пойдёт, а очередь без worktree держит им папку проекта для всех остальных (ADR 0128).
  if (carryOnItemOf(queue)) return { kind: 'held', reason: 'failed' }
  if (isInLine) return { kind: 'inLine' }

  return queue.nap && waitingItems(queue).length > 0 ? { kind: 'resting' } : { kind: 'idle' }
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
    case 'inLine':
    case 'resting':
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

/** Элемент кончился несделанным: упал или остановлен. Мимо него очередь не идёт (ADR 0082). */
export const isUnfinished = (item: QueueItem | null): boolean =>
  item?.state === 'failed' || item?.state === 'stopped'

/**
 * Нести ли строке элемента кнопку «продолжить прогон»: его можно продолжить с места (правило
 * `carryOnItemOf`, то же у главного процесса), а полоса остановки не предлагает того же своей
 * главной кнопкой - она это делает, когда за ним ждут другие. Так элемент, оборванный выходом IDE
 * или остановленный последним в очереди, продолжается прямо со строки, без окна прогона.
 */
export const canCarryOnFromRow = (queue: ScenarioQueue, item: QueueItem): boolean =>
  carryOnItemOf(queue)?.id === item.id &&
  isUnfinished(item) &&
  item.runId !== '' &&
  !(queue.hold && waitingItems(queue).length > 0)

/**
 * Какими словами сказать об остановке (ключ в `scenarios.queues.hold`). Помеченный руками стоит
 * «после него», но «как вы просили» тут неправда; оборванный выходом IDE, но успевший кончиться,
 * ничего не ждёт, кроме Resume.
 */
export const holdWords = (hold: QueueHold, item: QueueItem | null): HoldWords => {
  if (hold.reason === 'stopAfter' && item?.doneByHand) return 'doneByHand'
  if (hold.reason === 'interrupted' && item?.state === 'done') return 'interruptedDone'

  return hold.reason
}

/** Очереди одного проекта: вид сценариев показывает только их (ADR 0072). */
export const projectQueues = (
  view: Pick<ScenarioQueuesView, 'queues'> | undefined,
  projectPath: string,
): ScenarioQueue[] => view?.queues.filter((queue) => queue.projectPath === projectPath) ?? []
