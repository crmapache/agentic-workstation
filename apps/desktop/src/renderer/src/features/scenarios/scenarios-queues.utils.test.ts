import { it, expect, describe } from 'vitest'

import type { QueueItem, ScenarioQueue } from '@shared/scenario-queues'
import type { RunSummary } from '@shared/scenario-runs'
import type { Project } from '@shared/workspace'

import {
  liveOf,
  canGoTo,
  roadMood,
  holdItemOf,
  statusTone,
  boardCounts,
  boardGroups,
  itemDotTone,
  queueStatus,
  waitingItems,
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

const project = (id: string, rootPath: string, name: string): Project => ({ id, rootPath, name })

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

describe('точки элементов на доске', () => {
  it('по исходу, идущий с вопросом - акцентом, отказ - красным', () => {
    expect(itemDotTone(item('a', { state: 'done' }), undefined)).toBe('success')
    expect(itemDotTone(item('a', { state: 'failed' }), undefined)).toBe('danger')
    expect(itemDotTone(item('a', { state: 'stopped' }), undefined)).toBe('neutral')
    expect(itemDotTone(item('a'), undefined)).toBe('waiting')
    expect(itemDotTone(item('a', { refusal: 'untrusted' }), undefined)).toBe('danger')
    expect(itemDotTone(item('a', { state: 'running' }), run('r'))).toBe('warning')
    expect(itemDotTone(item('a', { state: 'running' }), run('r', { asking: 'Allow?' }))).toBe(
      'accent',
    )
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

describe('доска всех очередей', () => {
  const projects = [project('p1', '/work/app', 'app'), project('p2', '/work/site', 'site')]

  it('текущий проект первым, дальше по вкладкам, без вкладки - в конце по имени', () => {
    const groups = boardGroups(
      [
        queue('a', { projectPath: '/old/zeta' }),
        queue('b', { projectPath: '/work/app' }),
        queue('c', { projectPath: '/old/alpha' }),
        queue('d', { projectPath: '/work/site' }),
        queue('e', { projectPath: '/work/site' }),
      ],
      projects,
      '/work/site',
    )

    expect(groups.map((group) => group.name)).toEqual(['site', 'app', 'alpha', 'zeta'])
    expect(groups[0]?.isCurrent).toBe(true)
    expect(groups[0]?.queues.map((one) => one.id)).toEqual(['d', 'e'])
    expect(groups[2]?.projectId).toBeNull()
  })

  it('к закрытому проекту можно перейти, только если он в недавних', () => {
    const recent = [{ rootPath: '/old/alpha', name: 'alpha' }]

    expect(canGoTo({ projectId: 'p1', projectPath: '/work/app' }, [])).toBe(true)
    expect(canGoTo({ projectId: null, projectPath: '/old/alpha' }, recent)).toBe(true)
    expect(canGoTo({ projectId: null, projectPath: '/old/zeta' }, recent)).toBe(false)
  })

  it('идут и ждут человека - без пересечения', () => {
    const queues = [
      queue('a', { items: [item('1', { state: 'running', runId: 'r1' })] }),
      queue('b', { items: [item('2', { state: 'running', runId: 'r2' })] }),
      queue('c', { items: [item('3', { state: 'running', runId: 'r3' })] }),
      queue('d', { hold: { reason: 'failed', itemId: 'x', at: 1 } }),
      queue('e'),
    ]
    const live = [run('r1'), run('r2', { state: 'paused' }), run('r3', { state: 'blocked' })]

    expect(boardCounts(queues, live)).toEqual({ running: 2, waiting: 2 })
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
