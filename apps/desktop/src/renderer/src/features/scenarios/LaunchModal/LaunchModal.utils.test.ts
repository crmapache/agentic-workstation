import { it, expect, describe } from 'vitest'

import type { ScenarioQueue } from '@shared/scenario-queues'
import type { Scenario, ScenarioScope } from '@shared/scenarios'

import {
  shelvesOf,
  askedInputs,
  initialPick,
  currentWhere,
  findScenario,
  initialWhere,
  folderWaitFor,
  launchFailure,
  uncommittedCount,
} from './LaunchModal.utils'

const scenario = (id: string, scope: ScenarioScope, inputs: string[] = []): Scenario => ({
  version: 1,
  id,
  name: `${id} on ${scope}`,
  createdAt: 0,
  updatedAt: 0,
  inputs: inputs.map((name) => ({ id: name, name, label: '', placeholder: '', required: false })),
  head: {
    briefing: '',
    provider: 'claude',
    model: '',
    effort: '',
    permissionMode: '',
    onQuestion: 'head',
    retries: 0,
    onGiveUp: 'stop',
  },
  stages: [],
  scope,
})

const queue = (id: string): ScenarioQueue => ({
  id,
  projectPath: '/work/app',
  name: id,
  nameSource: 'ai',
  createdAt: 0,
  activeAt: 0,
  closedAt: 0,
  workdir: { kind: 'project' },
  items: [],
  stopAfterItemId: '',
  hold: null,
  hours: null,
  nap: null,
  turn: null,
})

describe('выбор сценария', () => {
  const shelf = [scenario('a', 'project'), scenario('a', 'user'), scenario('b', 'user')]

  it('по id и полке; полку не назвали или там нет - по id на любой', () => {
    expect(findScenario(shelf, { id: 'a', scope: 'user' })?.scope).toBe('user')
    expect(findScenario(shelf, { id: 'b', scope: 'project' })?.scope).toBe('user')
    expect(findScenario(shelf, { id: 'gone', scope: 'project' })).toBeNull()
    expect(findScenario(shelf, null)).toBeNull()
  })

  it('полки по отдельности, порядок полки сохраняется', () => {
    const { project, user } = shelvesOf(shelf)

    expect(project.map((one) => one.name)).toEqual(['a on project'])
    expect(user.map((one) => one.name)).toEqual(['a on user', 'b on user'])
  })

  it('безымянный вопрос не задают', () => {
    expect(
      askedInputs(scenario('a', 'project', ['task', ' ', 'notes'])).map((one) => one.name),
    ).toEqual(['task', 'notes'])
  })
})

describe('с чем окно открылось', () => {
  it('сценарий из запроса, полку не назвали - проектная', () => {
    expect(initialPick({ kind: 'launch' })).toBeNull()
    expect(initialPick({ kind: 'launch', scenarioId: 'a' })).toEqual({ id: 'a', scope: 'project' })
    expect(initialPick({ kind: 'launch', scenarioId: 'a', scope: 'user' })).toEqual({
      id: 'a',
      scope: 'user',
    })
  })

  it('«Add scenario» на очереди - в неё, иначе новая', () => {
    expect(initialWhere({ kind: 'launch', queueId: 'q1' })).toEqual({
      kind: 'queue',
      queueId: 'q1',
    })
    expect(initialWhere({ kind: 'launch' })).toEqual({ kind: 'new' })
  })
})

describe('куда ставить', () => {
  it('закрытая или ещё не пришедшая очередь - новая очередь', () => {
    const queues = [queue('q1')]

    expect(currentWhere({ kind: 'queue', queueId: 'q1' }, queues)).toEqual({
      kind: 'queue',
      queueId: 'q1',
    })
    expect(currentWhere({ kind: 'queue', queueId: 'q2' }, queues)).toEqual({ kind: 'new' })
    expect(currentWhere({ kind: 'new' }, queues)).toEqual({ kind: 'new' })
  })
})

describe('незакоммиченное и отказ', () => {
  it('файлы считаются только у прочитанного списка', () => {
    const files = [{ path: 'a.ts', kind: 'modified' as const, origin: null }]

    expect(uncommittedCount({ kind: 'listed', files, truncated: false })).toBe(1)
    expect(uncommittedCount({ kind: 'notGit' })).toBe(0)
    expect(uncommittedCount(undefined)).toBe(0)
  })

  it('код главного процесса с подробностью, исключение - неизвестно', () => {
    expect(launchFailure({ ok: false, code: 'notARepo', detail: 'git said no' }, false)).toEqual({
      code: 'notARepo',
      detail: 'git said no',
    })
    expect(launchFailure({ ok: false, code: 'noCli' }, false)).toEqual({
      code: 'noCli',
      detail: '',
    })
    expect(launchFailure(undefined, true)).toEqual({ code: 'unknown', detail: '' })
    expect(launchFailure({ ok: true, queueId: 'q', itemId: 'i' }, false)).toBeNull()
    expect(launchFailure(undefined, false)).toBeNull()
  })
})

describe('папка проекта занята', () => {
  const view = {
    queues: [queue('holder'), queue('waiting'), queue('idle')],
    folders: [{ projectPath: '/work/app', holders: ['holder'], line: ['waiting'] }],
  }
  const ids = (queues: ScenarioQueue[]) => queues.map((one) => one.id)

  it('новая очередь без worktree ждёт держателей, в своём worktree - никого', () => {
    expect(ids(folderWaitFor(view, '/work/app', { kind: 'new' }, false))).toEqual(['holder'])
    expect(folderWaitFor(view, '/work/app', { kind: 'new' }, true)).toEqual([])
    expect(folderWaitFor(view, '/work/site', { kind: 'new' }, false)).toEqual([])
  })

  it('в держателя сценарий идёт за своими, в простаивающую - ждёт папку', () => {
    const into = (queueId: string) =>
      ids(folderWaitFor(view, '/work/app', { kind: 'queue', queueId }, false))

    expect(into('holder')).toEqual([])
    expect(into('idle')).toEqual(['holder'])
    expect(into('waiting')).toEqual(['holder'])
  })
})
