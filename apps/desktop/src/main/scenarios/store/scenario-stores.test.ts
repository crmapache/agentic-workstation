import { rm, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { ScenarioSchedule } from '@shared/scenarios'

import { HiddenBook } from './hidden-book'
import { LockedFile } from './locked-file'
import { RunStore } from './run-store'
import { abandoned } from './run-summary'
import { ScenarioStore } from './scenario-store'
import { armed, isDue, nextDue, settled, isMissed } from './schedule-clock'
import { ScheduleStore } from './schedule-store'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'scenarios-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('schedule clock', () => {
  const hour = (extra: Partial<ScenarioSchedule> = {}): ScenarioSchedule => ({
    id: 'h',
    scenarioId: 's',
    scope: 'project',
    at: 9 * 60,
    repeat: 'daily',
    weekday: 1,
    inputs: {},
    nextAt: 0,
    lastAt: 0,
    missedAt: 0,
    worktree: false,
    provider: 'claude',
    ...extra,
  })

  it('finds the next nine o’clock, skipping weekends for weekdays', () => {
    const saturday = new Date(2026, 9, 17, 10, 0).getTime()
    const monday = new Date(2026, 9, 19, 9, 0).getTime()

    expect(nextDue(hour({ repeat: 'weekdays' }), saturday)).toBe(monday)
    expect(new Date(nextDue(hour({ repeat: 'weekly', weekday: 3 }), saturday)).getDay()).toBe(3)
  })

  it('takes an hour within its grace and calls an older one missed', () => {
    expect(isDue(hour({ nextAt: 1000 }), 1000 + 60_000)).toBe(true)
    expect(isMissed(hour({ nextAt: 1000 }), 1000 + 6 * 60_000)).toBe(true)
  })

  it('removes a one-off that ran and keeps one that was refused, saying it was missed', () => {
    const once = hour({ repeat: 'once', nextAt: 1000 })

    expect(armed(once, 1000).nextAt).toBe(0)
    expect(settled(once, 1000, 1000, true)).toBeNull()
    expect(settled(once, 1000, 1000, false)?.missedAt).toBe(1000)
  })

  it('claims an hour in the file once: a second look at the same hour gets nothing', async () => {
    const store = new ScheduleStore(new LockedFile(join(dir, 'hours.json')))

    await store.put(hour({ id: '', nextAt: 1000 }))

    const [stored] = (await store.stored()) ?? []
    const id = stored?.id ?? ''

    expect(await store.claim(id, 1000, armed(stored as ScenarioSchedule, 1000))).not.toBeNull()
    expect(await store.claim(id, 1000, armed(stored as ScenarioSchedule, 1000))).toBeNull()
  })

  it('does not take an unreadable file for an empty one', async () => {
    await writeFile(join(dir, 'hours.json'), 'not json')

    const store = new ScheduleStore(new LockedFile(join(dir, 'hours.json')))

    expect(await store.stored()).toBeNull()
    expect(await store.put(hour())).toBe(false)
  })
})

describe('stores on disk', () => {
  it('moves a scenario between shelves as it lies and keeps the order beside it', async () => {
    const project = join(dir, 'project')
    const home = join(dir, 'home')

    await mkdir(project)

    const store = new ScenarioStore(project, () => Promise.resolve(home))
    const one = await store.save({ ...(await blank()), id: 'one', name: 'One' }, 'project')
    const two = await store.save({ ...(await blank()), id: 'two', name: 'Two' }, 'project')

    expect(one && two).toBeTruthy()
    expect(await store.place('two', 'project', 'project', 'one')).toBeNull()
    expect((await store.shelf('project'))?.map((scenario) => scenario.id)).toEqual(['two', 'one'])
    expect(await store.place('one', 'project', 'user', '')).toBeNull()
    expect((await store.shelf('user'))?.map((scenario) => scenario.scope)).toEqual(['user'])
    expect(
      JSON.parse(await readFile(join(home, 'scenarios', 'one.json'), 'utf8')),
    ).not.toHaveProperty('scope')
  })

  it('closes an abandoned run at its last write, not at the next start', async () => {
    const runs = new RunStore(join(dir, 'runs'))
    const record = {
      ...(await runRecord()),
      state: 'running' as const,
      writtenAt: 500,
      startedAt: 100,
    }

    expect(abandoned(record, 10_000).finishedAt).toBe(500)

    await runs.keep(record, 500)
    await runs.repairAbandoned(new Set())

    expect((await runs.read('r1'))?.state).toBe('failed')
    expect((await runs.summaries()).map((summary) => summary.state)).toEqual(['failed'])
    expect(await runs.conversations()).toEqual(['head'])
  })

  it('fills the book of hidden conversations from past runs once', async () => {
    const book = new HiddenBook(new LockedFile(join(dir, 'book.json')), () =>
      Promise.resolve(['a', 'b']),
    )

    expect([...(await book.all())]).toEqual(['a', 'b'])

    await book.note('c')
    await book.release('a')

    expect([...(await book.all())]).toEqual(['b', 'c'])
  })
})

const blank = async () => {
  const { parseScenario } = await import('./scenario-parse')

  return parseScenario({ stages: [] }, 'project') as NonNullable<ReturnType<typeof parseScenario>>
}

const runRecord = async () => ({
  id: 'r1',
  projectPath: '/p',
  cwd: '/p',
  provider: 'claude' as const,
  queueId: '',
  itemId: '',
  scenarioId: 's',
  scenarioName: 'S',
  scope: 'project' as const,
  snapshot: await blank(),
  startedAt: 0,
  finishedAt: 0,
  state: 'running' as const,
  runFrom: '',
  inputs: {},
  total: 0,
  headConversationId: 'head',
  steps: [],
  notes: [],
  question: null,
  failure: '' as const,
  error: '',
  cost: 0,
  tokens: 0,
  idle: 0,
  rested: 0,
  restingSince: 0,
  writtenAt: 0,
  starred: false,
  answering: false,
  limit: null,
})
