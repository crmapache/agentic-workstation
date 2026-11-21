import { it, expect, describe, afterEach } from 'vitest'

import type {
  QueueItem,
  QueueAction,
  ScenarioQueue,
  ScenarioStartRequest,
} from '@shared/scenario-queues'
import type { Scenario } from '@shared/scenarios'
import type { TrackerScenario } from '@shared/tracker'

import { TrackerRuns } from './tracker-runs'
import { PLACE, trackerKit } from './tracker-test-kit'

const scenario = (id: string, inputs: string[], required = true): Scenario =>
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
const scenariosFake = (shelf: Scenario[]) => {
  const queues: ScenarioQueue[] = []
  const started: ScenarioStartRequest[] = []
  const actions: QueueAction[] = []
  let next = 0

  return {
    queues,
    started,
    actions,
    port: {
      fetch: (_path: string, id: string) =>
        Promise.resolve(shelf.find((one) => one.id === id) ?? null),
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

const closers: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()))
})

const setup = async (shelf: Scenario[]) => {
  const kit = await trackerKit()
  const fake = scenariosFake(shelf)
  const runs = new TrackerRuns(kit.service, fake.port, () => 7000)
  const projectId = await kit.make({ kind: 'project.create', title: 'P' })
  const flowId = await kit.make({ kind: 'flow.create', projectId, title: 'F' })
  const groupId = await kit.make({ kind: 'group.create', flowId, title: 'Неделя 1' })
  const card = (
    title: string,
    bound: Partial<TrackerScenario> | null,
    extra: { followUpOf?: string; done?: boolean } = {},
  ) =>
    kit.make({
      kind: 'card.create',
      groupId,
      ...(extra.followUpOf ? { followUpOf: extra.followUpOf } : {}),
      fields: {
        title,
        description: `about ${title}`,
        done: extra.done === true,
        scenario: bound
          ? { scenarioId: 'fix', scope: 'project', provider: null, inputs: {}, ...bound }
          : null,
      },
    })

  closers.push(() => kit.service.close())

  return { ...kit, ...fake, runs, groupId, card }
}

describe('отправка в очередь', () => {
  it('группа уходит одной очередью по порядку доски, лишние пропущены', async () => {
    const kit = await setup([scenario('fix', ['task'])])
    const a = await kit.card('A', {})

    await kit.card('A2', {}, { followUpOf: a })
    await kit.card('Без сценария', null)
    await kit.card('Сделано', {}, { done: true })
    await kit.card('B', { inputs: { task: 'Сделай {{title}}: {{description}}' } })

    const outcome = await kit.runs.send(PLACE, {
      source: { kind: 'group', groupId: kit.groupId },
      target: { kind: 'new', worktree: true },
    })

    expect(outcome.ok).toBe(true)
    expect(kit.started.map((request) => request.inputs.task)).toEqual([
      'A\n\nabout A',
      'A2\n\nabout A2',
      'Сделай B: about B',
    ])
    expect(kit.started.map((request) => request.target.kind)).toEqual(['new', 'queue', 'queue'])
    expect(kit.started[0]?.provider).toBe('claude')
    expect(kit.actions).toEqual([{ kind: 'rename', name: 'Неделя 1' }])

    const again = await kit.runs.send(PLACE, {
      source: { kind: 'group', groupId: kit.groupId },
      target: { kind: 'new', worktree: false },
    })

    expect(again).toEqual({ ok: false, code: 'nothingToSend', cardId: null })
  })

  it('сломанная привязка останавливает всё до первого запуска', async () => {
    const kit = await setup([scenario('fix', ['task'])])

    await kit.card('A', {})
    const broken = await kit.card('B', { scenarioId: 'gone' })
    const outcome = await kit.runs.send(PLACE, {
      source: { kind: 'group', groupId: kit.groupId },
      target: { kind: 'new', worktree: false },
    })

    expect(outcome).toEqual({ ok: false, code: 'scenarioGone', cardId: broken })
    expect(kit.started).toEqual([])
  })

  it('пустое обязательное поле - отказ, карточка без сценария - отказ', async () => {
    const kit = await setup([scenario('fix', ['task', 'notes'])])
    const a = await kit.card('A', { inputs: { task: '{{card}}', notes: '{{subtitle}}' } })
    const plain = await kit.card('B', null)

    expect(
      await kit.runs.send(PLACE, {
        source: { kind: 'card', cardId: a },
        target: { kind: 'new', worktree: false },
      }),
    ).toEqual({ ok: false, code: 'scenarioMissingInput', cardId: a })
    expect(
      await kit.runs.send(PLACE, {
        source: { kind: 'card', cardId: plain },
        target: { kind: 'new', worktree: false },
      }),
    ).toEqual({ ok: false, code: 'noScenario', cardId: plain })
  })
})

describe('статус карточки', () => {
  it('сделанный элемент отмечает карточку один раз', async () => {
    const kit = await setup([scenario('fix', ['task'])])
    const a = await kit.card('A', {})

    await kit.runs.send(PLACE, {
      source: { kind: 'card', cardId: a },
      target: { kind: 'new', worktree: false },
    })

    const item = kit.queues[0]?.items[0]

    if (!item) throw new Error('нет элемента')

    item.state = 'running'
    kit.runs.queuesChanged()
    let task = (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks[0]

    expect([task?.done, task?.run?.state]).toEqual([false, 'running'])

    item.state = 'done'
    kit.runs.queuesChanged()
    task = (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks[0]
    expect([task?.done, task?.doneAt, task?.run?.state]).toEqual([true, 7000, 'done'])

    await kit.apply({ kind: 'card.update', id: a, fields: { done: false } })
    kit.runs.queuesChanged()
    task = (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks[0]
    expect(task?.done).toBe(false)
  })

  it('упавший элемент карточку не отмечает', async () => {
    const kit = await setup([scenario('fix', ['task'])])
    const a = await kit.card('A', {})

    await kit.runs.send(PLACE, {
      source: { kind: 'card', cardId: a },
      target: { kind: 'new', worktree: false },
    })

    const item = kit.queues[0]?.items[0]

    if (item) item.state = 'failed'
    kit.runs.queuesChanged()

    const task = (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks[0]

    expect([task?.done, task?.run?.state]).toEqual([false, 'failed'])
  })

  it('карточку в очереди второй раз не отправить; закрытая очередь её отпускает', async () => {
    const kit = await setup([scenario('fix', ['task'])])
    const a = await kit.card('A', {})
    const send = () =>
      kit.runs.send(PLACE, {
        source: { kind: 'card', cardId: a },
        target: { kind: 'new', worktree: false },
      })

    await send()
    expect(await send()).toEqual({ ok: false, code: 'alreadyQueued', cardId: a })

    const queue = kit.queues[0]

    if (!queue) throw new Error('нет очереди')

    // Очередь закрыли с живым worktree: элемент так и «ждёт», но запускать его уже некому.
    queue.closedAt = 1
    kit.runs.queuesChanged()

    const task = (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks[0]

    expect(task?.run?.state).toBe('gone')
    expect((await send()).ok).toBe(true)
  })
})
