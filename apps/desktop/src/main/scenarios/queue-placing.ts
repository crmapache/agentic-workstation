import { randomUUID } from 'node:crypto'

import type { QueueItem, ScenarioQueue, ScenarioStartRequest } from '@shared/scenario-queues'
import { answersOf, isRunnable, missingInputs } from '@shared/scenario-rules'
import type { ScenarioCode } from '@shared/scenarios'

import type { ScenarioProvider } from '../providers/scenario-provider'
import type { RunnerHost } from './queue-runner'
import { queueWorktree } from './queue-worktree'
import { addItem, fallbackName } from './queues/queue-rules'
import { scopeOf } from './store/scenario-parse'

export const shortId = (): string => randomUUID().replaceAll('-', '').slice(0, 16)

type Placed = { queueId: string; itemId: string } | { code: ScenarioCode; detail?: string }

/**
 * Поставить сценарий: проверить его на полке, собрать элемент и положить в новую очередь (с
 * worktree или без) или в конец существующей. Запуск - не здесь: им занимается шаг очереди.
 */
export const placeItem = async (
  host: RunnerHost,
  request: ScenarioStartRequest,
): Promise<Placed> => {
  const scenario = await host
    .desk(request.projectPath)
    .store.find(request.scenarioId, scopeOf(request.scope))
  const provider = host.provider(request.provider)

  if (!scenario) return { code: 'scenarioGone' }
  if (!isRunnable(scenario)) return { code: 'scenarioBroken' }
  if (missingInputs(scenario, request.inputs).length > 0) return { code: 'scenarioMissingInput' }
  if (!provider) return { code: 'providerMissing' }

  const item: QueueItem = {
    id: shortId(),
    scenarioId: scenario.id,
    scope: scenario.scope,
    scenarioName: scenario.name,
    inputs: answersOf(scenario, request.inputs),
    provider: request.provider,
    afterSuccess: request.afterSuccess,
    addedAt: Date.now(),
    runId: '',
    state: 'waiting',
    refusal: null,
  }
  const placed =
    request.target.kind === 'new'
      ? await openQueue(host, request.projectPath, item, request.target.worktree, provider)
      : joinQueue(host, request.target.queueId, request.projectPath, item)

  return 'code' in placed ? placed : { queueId: placed.queueId, itemId: item.id }
}

const openQueue = async (
  host: RunnerHost,
  projectPath: string,
  item: QueueItem,
  worktree: boolean,
  provider: ScenarioProvider,
): Promise<{ queueId: string } | { code: ScenarioCode; detail?: string }> => {
  const id = shortId()
  // Нет CLI или доверия - отказ до git: иначе каждый такой запуск (и каждый час расписания)
  // оставлял бы новый пустой worktree с веткой.
  const unready = worktree ? await provider.prepare(projectPath) : null

  if (unready) return { code: unready }

  const workdir = worktree
    ? await queueWorktree.create(projectPath, item.scenarioName, id, host.worktreesRoot)
    : ({ kind: 'project' } as const)

  if ('code' in workdir) return workdir

  const queue: ScenarioQueue = {
    id,
    projectPath,
    name: fallbackName(item.scenarioName, item.inputs),
    nameSource: 'fallback',
    createdAt: Date.now(),
    closedAt: 0,
    workdir,
    items: [item],
    stopAfterItemId: '',
    hold: null,
    acknowledgedItemId: '',
  }

  host.book.put(queue)

  return { queueId: id }
}

const joinQueue = (
  host: RunnerHost,
  queueId: string,
  projectPath: string,
  item: QueueItem,
): { queueId: string } | { code: ScenarioCode } => {
  const queue = host.book.get(queueId)

  if (!queue || queue.projectPath !== projectPath) return { code: 'queueGone' }
  if (queue.closedAt > 0) return { code: 'queueClosed' }
  // Worktree очереди удаляется - новый сценарий там не начнётся.
  if (host.removing.has(queueId)) return { code: 'queueBusy' }

  host.book.put(addItem(queue, item))

  return { queueId }
}
