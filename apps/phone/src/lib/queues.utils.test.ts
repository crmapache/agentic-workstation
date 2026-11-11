import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { QueueWire, RunSummaryWire } from '@agentic-workstation/remote-protocol/wire-types'

import { openQueues, queueFacts, boardCounts, boardGroups, waitingCount } from './queues.utils'

const queue = (id: string, over: Partial<QueueWire> = {}): QueueWire => ({
  id,
  projectKey: 'p-x',
  projectName: 'x',
  name: id,
  createdAt: 0,
  closedAt: 0,
  workdir: { kind: 'project' },
  items: [
    {
      id: 'i',
      scenarioId: 's',
      scope: 'project',
      scenarioName: 'S',
      inputs: {},
      provider: 'claude',
      afterSuccess: false,
      addedAt: 0,
      runId: '',
      state: 'waiting',
      refusal: null,
    },
  ],
  stopAfterItemId: '',
  hold: null,
  acknowledgedItemId: '',
  ...over,
})

const run = (queueId: string, asking = ''): RunSummaryWire =>
  ({ queueId, asking, scenarioName: 'S', done: 1, total: 3, state: 'running' }) as RunSummaryWire

const t = ((key: string, options?: { count?: number }) =>
  options?.count === undefined ? key : `${options.count} ${key}`) as unknown as TFunction

describe('очереди на телефоне', () => {
  it('только открытые, с идущим прогоном - первыми', () => {
    expect(
      openQueues(
        [queue('idle'), queue('closed', { closedAt: 5 }), queue('busy')],
        [run('busy')],
      ).map((one) => one.id),
    ).toEqual(['busy', 'idle'])
    expect(waitingCount(queue('x'))).toBe(1)
  })

  it('строка очереди: ветка worktree или папка проекта, идущий прогон, сколько ждёт', () => {
    const tree = queue('a', {
      workdir: { kind: 'worktree', gitBranch: 'scenarios/a', removed: false },
    })

    expect(queueFacts(t, tree, run('a'))).toBe('scenarios/a · S 1/3 · 1 project.waitingItems')
    expect(queueFacts(t, queue('b'), undefined)).toBe(
      'queue.projectFolder · 1 project.waitingItems',
    )
  })

  it('доска: по проектам в порядке инвентаря, проект без вкладки и недавних - в конце по имени', () => {
    const queues = [
      queue('z1', { projectKey: 'p-zeta', projectName: 'zeta' }),
      queue('o1', { projectKey: 'p-open', projectName: 'open-app' }),
      queue('a1', { projectKey: 'p-alpha', projectName: 'alpha' }),
      queue('o2', { projectKey: 'p-open', projectName: 'open-app' }),
      queue('gone', { projectKey: 'p-open', projectName: 'open-app', closedAt: 9 }),
    ]
    const groups = boardGroups(queues, [run('o2')], ['p-open'])

    expect(groups.map((group) => [group.name, group.queues.map((one) => one.id)])).toEqual([
      ['open-app', ['o2', 'o1']],
      ['alpha', ['a1']],
      ['zeta', ['z1']],
    ])
  })

  it('сводка доски: идёт - без вопроса; ждёт человека - вопрос или очередь встала', () => {
    const held = queue('h', { hold: { reason: 'failed', itemId: 'i', at: 1 } })

    expect(
      boardCounts([queue('a'), queue('b'), held, queue('c')], [run('a'), run('b', 'Delete?')]),
    ).toEqual({ running: 1, waiting: 2 })
  })
})
