import type {
  QueueItem,
  QueueAction,
  ScenarioQueue,
  ScenarioStartRequest,
} from '@shared/scenario-queues'
import type { Scenario } from '@shared/scenarios'

/**
 * Подставные сценарии для проверок трекера: полка в памяти, очереди растут от start, состояние
 * элементов правит сама проверка.
 */

export const scenario = (id: string, inputs: string[], required = true): Scenario =>
  ({
    version: 1,
    id,
    name: id,
    createdAt: 0,
    updatedAt: 0,
    scope: 'project',
    inputs: inputs.map((name, index) => ({
      id: `i${index}`,
      name,
      label: name,
      placeholder: '',
      required,
    })),
    head: { provider: 'claude', briefing: '', model: '', effort: '' },
    stages: [
      {
        id: 's1',
        title: 'Stage',
        repeat: 1,
        untilDone: false,
        cards: [
          {
            id: 'c1',
            title: 'Card',
            prompt: inputs.map((name) => `{{${name}}}`).join(' ') || 'go',
            slots: [],
            dod: '',
            after: '',
          },
        ],
      },
    ],
  }) as unknown as Scenario

/** Сценарии в памяти: очереди растут от start, состояние элементов правит проверка. */
export const scenariosFake = (shelf: Scenario[]) => {
  const queues: ScenarioQueue[] = []
  const started: ScenarioStartRequest[] = []
  const actions: QueueAction[] = []
  const fetched: string[] = []
  let next = 0

  return {
    queues,
    started,
    actions,
    fetched,
    port: {
      fetch: (_path: string, id: string) => {
        fetched.push(id)

        return Promise.resolve(shelf.find((one) => one.id === id) ?? null)
      },
      start: (request: ScenarioStartRequest) => {
        started.push(request)
        next += 1

        const item = { id: `item-${next}`, state: 'waiting' } as QueueItem

        if (request.target.kind === 'queue') {
          const { queueId } = request.target

          queues.find((queue) => queue.id === queueId)?.items.push(item)

          return Promise.resolve({ ok: true as const, queueId, itemId: item.id })
        }

        queues.push({ id: `queue-${next}`, items: [item], closedAt: 0 } as ScenarioQueue)

        return Promise.resolve({ ok: true as const, queueId: `queue-${next}`, itemId: item.id })
      },
      act: (_queueId: string, action: QueueAction) => {
        actions.push(action)

        return Promise.resolve(null)
      },
      queues: () => queues,
    },
  }
}
