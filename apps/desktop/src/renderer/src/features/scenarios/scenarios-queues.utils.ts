import type { QueueItem, ScenarioQueue, QueueHoldReason } from '@shared/scenario-queues'
import type { RunState, RunSummary } from '@shared/scenario-runs'
import type { Project, ProjectRef } from '@shared/workspace'

import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

import { splitPath } from '../../lib/path.utils'
import type { RoadMood } from './ScenarioRoadmap/ScenarioRoadmap.types'

/**
 * Очереди на экране: что очередь делает сейчас (по самой очереди и сводке её идущего прогона),
 * какой у этого тон, как доска группирует очереди по проектам и что сказать окну запуска о
 * соседях в той же папке. Всё здесь - арифметика без React: проверяется тестом.
 */

/** Что очередь делает сейчас - одно слово для метки и тона. */
export type QueueStatus =
  | { kind: 'running' }
  | { kind: 'paused' }
  /** Идущий прогон ждёт человека: вопрос или разрешение. */
  | { kind: 'asking' }
  | { kind: 'held'; reason: QueueHoldReason }
  | { kind: 'idle' }

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

/** Прогон ждёт человека: стоит на вопросе или спрашивает разрешения. */
export const isAsking = (run: Pick<RunSummary, 'state' | 'asking'>): boolean =>
  run.state === 'blocked' || run.asking !== ''

/**
 * Состояние очереди. Идущий элемент главнее остановки: остановка ставится, только когда
 * элемент кончился, и пока что-то идёт, её нет. Пауза поверх вопроса - вопрос: на него можно
 * ответить, и это то, что человек должен увидеть.
 */
export const queueStatus = (queue: ScenarioQueue, live: RunSummary | undefined): QueueStatus => {
  if (runningItemOf(queue)) {
    if (live && isAsking(live)) return { kind: 'asking' }

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
      return 'neutral'
  }
}

/** Тон точки элемента на доске; waiting - пустой кружок: ещё не начинался. */
export type ItemDotTone = BadgeTone | 'waiting'

export const itemDotTone = (item: QueueItem, live: RunSummary | undefined): ItemDotTone => {
  switch (item.state) {
    case 'running':
      return live && isAsking(live) ? 'accent' : 'warning'
    case 'done':
      return 'success'
    case 'failed':
      return 'danger'
    case 'stopped':
      return 'neutral'
    case 'waiting':
      return item.refusal ? 'danger' : 'waiting'
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

/**
 * Сводка доски: сколько очередей идёт и сколько ждут человека - вопросом или остановкой,
 * которую снимает только он. Без пересечения: ждущая ответа - в «ждут», не в «идут».
 */
export const boardCounts = (
  queues: readonly ScenarioQueue[],
  live: readonly RunSummary[],
): { running: number; waiting: number } => {
  const statuses = queues.map((queue) => queueStatus(queue, liveOf(queue, live)))

  return {
    running: statuses.filter((status) => status.kind === 'running' || status.kind === 'paused')
      .length,
    waiting: statuses.filter((status) => status.kind === 'asking' || status.kind === 'held').length,
  }
}

/** Проект на доске: его очереди, имя и открыт ли он (без id - вкладка проекта закрыта). */
export type BoardGroup = {
  projectPath: string
  projectId: string | null
  name: string
  isCurrent: boolean
  queues: ScenarioQueue[]
}

/**
 * Очереди по проектам: текущий первым, дальше в порядке вкладок проектов, проекты без
 * вкладки (очередь пережила закрытие проекта) - в конце по имени.
 */
export const boardGroups = (
  queues: readonly ScenarioQueue[],
  projects: readonly Project[],
  currentPath: string,
): BoardGroup[] => {
  const paths = [...new Set(queues.map((queue) => queue.projectPath))]
  const tabOf = (path: string) => projects.findIndex((project) => project.rootPath === path)
  const groups = paths.map((path): BoardGroup => {
    const project = projects.find((one) => one.rootPath === path)

    return {
      projectPath: path,
      projectId: project?.id ?? null,
      name: project?.name ?? splitPath(path).name,
      isCurrent: path === currentPath,
      queues: queues.filter((queue) => queue.projectPath === path),
    }
  })
  const rank = (group: BoardGroup) =>
    group.isCurrent ? -1 : group.projectId ? tabOf(group.projectPath) : projects.length

  return groups.sort(
    (left, right) => rank(left) - rank(right) || left.name.localeCompare(right.name),
  )
}

/**
 * Можно ли перейти к проекту группы: открытый - да, закрытый - только из недавних (главный
 * процесс открывает по пути лишь их: окно не может так открыть произвольную папку).
 */
export const canGoTo = (
  group: Pick<BoardGroup, 'projectId' | 'projectPath'>,
  recent: readonly ProjectRef[],
): boolean =>
  group.projectId !== null || recent.some((project) => project.rootPath === group.projectPath)

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
