import { it, expect, describe } from 'vitest'

import type { QueueItem, ScenarioQueue } from '@shared/scenario-queues'

import {
  hoursNow,
  daysWords,
  queueRest,
  spanLabel,
  DEFAULT_HOURS,
} from './scenarios-queue-hours.utils'

const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const name = (day: number) => NAMES[day - 1] ?? ''

/** Местное время: 16 ноября 2026 - понедельник. */
const at = (day: number, hour: number) => new Date(2026, 10, day, hour).getTime()

const item = (id: string, patch: Partial<QueueItem> = {}): QueueItem => ({
  id,
  scenarioId: `s-${id}`,
  scope: 'project',
  scenarioName: `Scenario ${id}`,
  inputs: {},
  provider: 'claude',
  addedAt: 0,
  runId: '',
  state: 'waiting',
  refusal: null,
  ...patch,
})

const queueOf = (patch: Partial<ScenarioQueue>, ...items: QueueItem[]): ScenarioQueue => ({
  id: 'q',
  projectPath: '/work/app',
  name: 'Queue',
  nameSource: 'ai',
  createdAt: 0,
  closedAt: 0,
  workdir: { kind: 'project' },
  items,
  stopAfterItemId: '',
  hold: null,
  hours: DEFAULT_HOURS,
  nap: { at: at(16, 19), until: at(17, 10), runId: '' },
  ...patch,
})

describe('queue hours on screen', () => {
  it('names the days shortly', () => {
    expect(daysWords([1, 2, 3, 4, 5, 6, 7], name).key).toBe('everyDay')
    expect(daysWords([1, 2, 3, 4, 5], name).key).toBe('weekdays')
    expect(daysWords([6, 7], name).key).toBe('weekend')
    expect(daysWords([1, 2, 3, 4, 6], name)).toEqual({ key: 'list', days: 'Mon-Thu, Sat' })
    expect(daysWords([1, 3, 5], name)).toEqual({ key: 'list', days: 'Mon, Wed, Fri' })
    expect(daysWords([1, 2, 5, 6, 7], name)).toEqual({ key: 'list', days: 'Mon, Tue, Fri-Sun' })
  })

  it('shows the window, or nothing for a whole day', () => {
    expect(spanLabel(DEFAULT_HOURS)).toBe('10:00-19:00')
    expect(spanLabel({ from: 0, to: 0, days: [6] })).toBeNull()
  })

  it('tells what saving the hours does right now', () => {
    expect(hoursNow(DEFAULT_HOURS, at(16, 12))).toEqual({ kind: 'inside', until: at(16, 19) })
    expect(hoursNow(DEFAULT_HOURS, at(16, 20))).toEqual({ kind: 'outside', until: at(17, 10) })
    expect(hoursNow({ ...DEFAULT_HOURS, days: [] }, at(16, 12))).toEqual({ kind: 'noDays' })
    expect(hoursNow({ from: 0, to: 0, days: [1, 2, 3, 4, 5, 6, 7] }, at(16, 12))).toEqual({
      kind: 'always',
    })
  })

  it('says why a sleeping queue stands', () => {
    const paused = item('a', { runId: 'r1', state: 'running' })

    expect(queueRest(queueOf({ nap: { at: 1, until: 2, runId: 'r1' } }, paused))).toEqual({
      kind: 'paused',
      name: 'Scenario a',
      until: 2,
    })
    // Оборван выходом IDE ночью - продолжится утром, это тоже «на паузе».
    const cut = item('a', { runId: 'r1', state: 'stopped' })

    expect(queueRest(queueOf({ nap: { at: 1, until: 2, runId: 'r1' } }, cut))?.kind).toBe('paused')
    expect(queueRest(queueOf({}, item('b')))).toEqual({ kind: 'waiting', until: at(17, 10) })
    // Спать не над чем - и говорить не о чем.
    expect(queueRest(queueOf({}, item('c', { state: 'done' })))).toBeNull()
    expect(queueRest(queueOf({ nap: null }, item('b')))).toBeNull()
  })
})
