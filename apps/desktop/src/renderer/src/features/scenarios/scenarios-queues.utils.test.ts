import { it, expect, describe } from 'vitest'

import type { QueueItem, ScenarioQueue } from '@shared/scenario-queues'
import type { RunSummary } from '@shared/scenario-runs'

import {
  liveOf,
  roadMood,
  holdItemOf,
  statusTone,
  queueStatus,
  waitingItems,
  projectQueues,
  folderNeighbours,
} from './scenarios-queues.utils'

const item = (id: string, patch: Partial<QueueItem> = {}): QueueItem => ({
  id,
  scenarioId: `scenario-${id}`,
  scope: 'project',
  scenarioName: `Scenario ${id}`,
  inputs: {},
  provider: 'claude',
  afterSuccess: true,
  addedAt: 0,
  runId: '',
  state: 'waiting',
  refusal: null,
  ...patch,
})

const queue = (id: string, patch: Partial<ScenarioQueue> = {}): ScenarioQueue => ({
  id,
  projectPath: '/work/app',
  name: `Queue ${id}`,
  nameSource: 'ai',
  createdAt: 0,
  closedAt: 0,
  workdir: { kind: 'project' },
  items: [],
  stopAfterItemId: '',
  hold: null,
  acknowledgedItemId: '',
  ...patch,
})

const run = (id: string, patch: Partial<RunSummary> = {}): RunSummary => ({
  id,
  projectPath: '/work/app',
  provider: 'claude',
  queueId: '',
  itemId: '',
  scenarioId: 'scenario',
  scenarioName: 'Scenario',
  scope: 'project',
  startedAt: 1000,
  finishedAt: 0,
  state: 'running',
  total: 3,
  done: 1,
  failure: '',
  cost: 0,
  inputs: {},
  tokens: 0,
  idle: 0,
  rested: 0,
  restingSince: 0,
  stageTitle: '',
  at: '',
  asking: '',
  roadmap: [],
  starred: false,
  limit: null,
  origin: 'ide',
  ...patch,
})

describe('живой прогон очереди', () => {
  it('по runId идущего элемента, пока его нет - по очереди', () => {
    const going = queue('q', { items: [item('a', { state: 'running', runId: 'r1' })] })

    expect(liveOf(going, [run('r0', { queueId: 'q' }), run('r1')])?.id).toBe('r1')
    expect(liveOf(going, [run('r0', { queueId: 'q' })])?.id).toBe('r0')
    expect(liveOf(queue('other'), [run('r0', { queueId: 'q' })])).toBeUndefined()
  })
})

describe('состояние очереди', () => {
  const going = queue('q', { items: [item('a', { state: 'running', runId: 'r' })] })

  it('идущий элемент: работает, на паузе, ждёт человека', () => {
    expect(queueStatus(going, run('r'))).toEqual({ kind: 'running' })
    expect(queueStatus(going, undefined)).toEqual({ kind: 'running' })
    expect(queueStatus(going, run('r', { state: 'paused' }))).toEqual({ kind: 'paused' })
    expect(queueStatus(going, run('r', { state: 'blocked' }))).toEqual({ kind: 'asking' })
  })

  it('пауза поверх вопроса - вопрос: на него можно ответить', () => {
    expect(queueStatus(going, run('r', { state: 'paused', asking: 'Allow?' }))).toEqual({
      kind: 'asking',
    })
  })

  it('стоит с причиной или свободна', () => {
    const held = queue('q', {
      items: [item('a', { state: 'failed' }), item('b')],
      hold: { reason: 'failed', itemId: 'a', at: 1 },
    })

    expect(queueStatus(held, undefined)).toEqual({ kind: 'held', reason: 'failed' })
    expect(queueStatus(queue('q'), undefined)).toEqual({ kind: 'idle' })
  })

  it('тон: провал и отказ красные, остановка рукой серая', () => {
    expect(statusTone({ kind: 'running' })).toBe('warning')
    expect(statusTone({ kind: 'asking' })).toBe('accent')
    expect(statusTone({ kind: 'held', reason: 'refused' })).toBe('danger')
    expect(statusTone({ kind: 'held', reason: 'failed' })).toBe('danger')
    expect(statusTone({ kind: 'held', reason: 'stopAfter' })).toBe('neutral')
    expect(statusTone({ kind: 'held', reason: 'interrupted' })).toBe('neutral')
    expect(statusTone({ kind: 'idle' })).toBe('neutral')
  })
})

describe('дорога и часы', () => {
  it('настроение дороги по состоянию прогона', () => {
    expect(roadMood('blocked')).toBe('asking')
    expect(roadMood('paused')).toBe('paused')
    expect(roadMood('running')).toBe('working')
  })
})

describe('элементы очереди', () => {
  it('ждущие по порядку и элемент остановки', () => {
    const held = queue('q', {
      items: [item('a', { state: 'done' }), item('b'), item('c')],
      hold: { reason: 'stopAfter', itemId: 'a', at: 1 },
    })

    expect(waitingItems(held).map((one) => one.id)).toEqual(['b', 'c'])
    expect(holdItemOf(held)?.id).toBe('a')
    expect(holdItemOf(queue('q'))).toBeNull()
    expect(holdItemOf({ ...held, hold: { reason: 'refused', itemId: 'gone', at: 1 } })).toBeNull()
  })
})

describe('очереди проекта', () => {
  it('только очереди этого проекта, в их порядке; снимка ещё нет - пусто', () => {
    const view = {
      queues: [
        queue('a', { projectPath: '/work/site' }),
        queue('b', { projectPath: '/work/app' }),
        queue('c', { projectPath: '/work/site' }),
      ],
    }

    expect(projectQueues(view, '/work/site').map((one) => one.id)).toEqual(['a', 'c'])
    expect(projectQueues(view, '/work/other')).toEqual([])
    expect(projectQueues(undefined, '/work/site')).toEqual([])
  })
})

describe('соседи в папке проекта', () => {
  it('только очереди без worktree, которым ещё есть что делать', () => {
    const worktree = {
      kind: 'worktree' as const,
      path: '/wt',
      projectDir: '/wt',
      gitBranch: 'scenarios/x',
      baseCommit: 'abc',
      removed: false,
    }
    const queues = [
      queue('a', { items: [item('1', { state: 'running' })] }),
      queue('b', { items: [item('2', { state: 'done' })] }),
      queue('c', { items: [item('3')], workdir: worktree }),
      queue('d', { items: [item('4')], projectPath: '/work/site' }),
      queue('e', { items: [item('5', { state: 'done' }), item('6')] }),
    ]

    expect(folderNeighbours(queues, '/work/app').map((one) => one.id)).toEqual(['a', 'e'])
  })
})
