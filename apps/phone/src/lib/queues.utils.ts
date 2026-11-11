import type { TFunction } from 'i18next'

import type { QueueWire, RunSummaryWire } from '@agentic-workstation/remote-protocol/wire-types'

/** Открытые очереди - сначала те, где что-то идёт; закрытые - история, на телефоне их нет. */
export const openQueues = (queues: QueueWire[], live: RunSummaryWire[]): QueueWire[] => {
  const busy = new Set(live.map((run) => run.queueId))

  return queues
    .filter((queue) => queue.closedAt === 0)
    .sort((first, second) => Number(busy.has(second.id)) - Number(busy.has(first.id)))
}

/** Сколько ждущих в очереди. */
export const waitingCount = (queue: QueueWire): number =>
  queue.items.filter((item) => item.state === 'waiting').length

/** Строка очереди под её именем: папка, идущий прогон с долей шагов, сколько ждёт. */
export const queueFacts = (
  t: TFunction,
  queue: QueueWire,
  run: RunSummaryWire | undefined,
): string =>
  [
    queue.workdir.kind === 'worktree' ? queue.workdir.gitBranch : t('queue.projectFolder'),
    run ? `${run.scenarioName} ${run.done}/${run.total}` : null,
    t('project.waitingItems', { count: waitingCount(queue) }),
  ]
    .filter(Boolean)
    .join(' · ')

export type BoardGroup = { projectKey: string; name: string; queues: QueueWire[] }

/**
 * Доска всех очередей машины: открытые очереди по проектам - в порядке проектов инвентаря
 * (открытые, потом недавние), проекты, которых в нём нет (очередь пережила и закрытие, и уход из
 * недавних), - в конце по имени. Внутри проекта - сначала те, где что-то идёт.
 */
export const boardGroups = (
  queues: QueueWire[],
  live: RunSummaryWire[],
  projectOrder: readonly string[],
): BoardGroup[] => {
  const groups = new Map<string, BoardGroup>()

  for (const queue of openQueues(queues, live)) {
    const group = groups.get(queue.projectKey) ?? {
      projectKey: queue.projectKey,
      name: queue.projectName,
      queues: [],
    }

    group.queues.push(queue)
    groups.set(queue.projectKey, group)
  }

  const rank = (key: string) => {
    const at = projectOrder.indexOf(key)

    return at === -1 ? projectOrder.length : at
  }

  return [...groups.values()].sort(
    (first, second) =>
      rank(first.projectKey) - rank(second.projectKey) || first.name.localeCompare(second.name),
  )
}

/** Сводка доски: что идёт (и стоит на паузе) и что ждёт человека (вопрос или очередь встала). */
export const boardCounts = (
  queues: QueueWire[],
  live: RunSummaryWire[],
): { running: number; waiting: number } => {
  const open = openQueues(queues, live)
  const runOf = (queue: QueueWire) => live.find((run) => run.queueId === queue.id)

  return {
    running: open.filter((queue) => runOf(queue) && !runOf(queue)?.asking).length,
    waiting: open.filter((queue) => Boolean(runOf(queue)?.asking) || queue.hold !== null).length,
  }
}
