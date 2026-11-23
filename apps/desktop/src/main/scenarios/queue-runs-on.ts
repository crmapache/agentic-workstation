import type { QueueItem, ScenarioQueue } from '@shared/scenario-queues'
import type { Scenario, ScenarioScope } from '@shared/scenarios'

import type { RunnerHost } from './queue-runner'
import { runsOnOf } from './runs-on'
import type { FreshRunsOn } from './queues/queue-rules'
import { withRunsOn } from './queues/queue-rules'

/** Полки, прочитанные за один пересчёт: ждущих одного сценария бывает много, файл - один. */
type Shelves = Map<string, Promise<Scenario[] | null>>

const shelfOf = (
  host: RunnerHost,
  shelves: Shelves,
  projectPath: string,
  scope: ScenarioScope,
): Promise<Scenario[] | null> => {
  const key = `${projectPath}\0${scope}`
  const known = shelves.get(key)

  if (known) return known

  const read = host
    .desk(projectPath)
    .store.shelf(scope)
    .catch(() => null)

  shelves.set(key, read)

  return read
}

const freshOf = async (
  host: RunnerHost,
  shelves: Shelves,
  queue: ScenarioQueue,
  item: QueueItem,
): Promise<FreshRunsOn | null> => {
  if (item.placeholder) return null

  if (item.state === 'waiting') {
    const shelf = await shelfOf(host, shelves, queue.projectPath, item.scope)
    const scenario = shelf?.find((one) => one.id === item.scenarioId)

    return scenario
      ? { itemId: item.id, runsOn: runsOnOf(scenario, host.provider(item.provider)), from: 'shelf' }
      : null
  }

  if (item.runsOn || !item.runId) return null

  const run = await host
    .desk(queue.projectPath)
    .runs.read(item.runId)
    .catch(() => null)

  return run
    ? { itemId: item.id, runsOn: runsOnOf(run.snapshot, host.provider(run.provider)), from: 'run' }
    : null
}

/**
 * «На чём идёт» элементов открытых очередей - свежим: ждущие - по сценарию на полке (его могли
 * поправить после постановки), стартовавшие без записи (очередь старого выпуска) - по снимку
 * своего прогона. Пересчёт - не дело очереди: запись тихая.
 */
export const refreshRunsOn = async (host: RunnerHost): Promise<void> => {
  const shelves: Shelves = new Map()

  for (const queue of host.book.all()) {
    if (queue.closedAt > 0) continue

    const fresh = await Promise.all(queue.items.map((item) => freshOf(host, shelves, queue, item)))
    // Пока читались полки, очередь могла пойти дальше: правка ложится на свежую.
    const latest = host.book.get(queue.id)
    const next =
      latest &&
      withRunsOn(
        latest,
        fresh.filter((one) => one !== null),
      )

    if (next && host.book.put(next, { quiet: true })) host.onQueues()
  }
}
