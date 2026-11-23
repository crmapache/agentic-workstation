import { it, expect, describe } from 'vitest'

import type { QueueItem, QueueHours, ScenarioQueue } from '@shared/scenario-queues'

import {
  wakeUp,
  napMove,
  setHours,
  isResting,
  fallAsleep,
  missedWake,
  forgetNapRun,
  nextHoursMove,
} from './queue-nap'
import { parseQueue } from './queue-parse'
import { nextToStart, recoverQueue, holdBeforeFailure } from './queue-rules'

/** Местное время: 16 ноября 2026 - понедельник. */
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime()

const HOURS: QueueHours = { from: 10 * 60, to: 19 * 60, days: [1, 2, 3, 4, 5] }

const item = (id: string, patch: Partial<QueueItem> = {}): QueueItem => ({
  id,
  scenarioId: `s-${id}`,
  scope: 'project',
  scenarioName: `Scenario ${id}`,
  inputs: {},
  provider: 'claude',
  addedAt: 1,
  runId: '',
  state: 'waiting',
  refusal: null,
  ...patch,
})

const queueOf = (patch: Partial<ScenarioQueue>, ...items: QueueItem[]): ScenarioQueue => ({
  id: 'q',
  projectPath: '/p',
  name: 'Q',
  nameSource: 'fallback',
  createdAt: 1,
  activeAt: 1,
  closedAt: 0,
  workdir: { kind: 'project' },
  items,
  stopAfterItemId: '',
  hold: null,
  hours: HOURS,
  nap: null,
  ...patch,
})

describe('queue naps', () => {
  it('sleeps once the window is over, until it opens again', () => {
    const queue = queueOf({})

    expect(napMove(queue, at(16, 12))).toEqual({ kind: 'stay' })
    expect(napMove(queue, at(20, 19, 5))).toEqual({ kind: 'sleep', until: at(23, 10) })
    expect(napMove(queueOf({ hours: null }), at(20, 23))).toEqual({ kind: 'stay' })
  })

  it('does not put a queue to sleep twice in one break', () => {
    const asleep = fallAsleep(queueOf({}), at(16, 19), at(17, 10), 'r1')

    // Человек снял прогон с паузы в 22:00 - часы его до утра не трогают.
    expect(napMove(forgetNapRun(asleep, 'r1'), at(16, 22))).toEqual({ kind: 'stay' })
    // А со вчерашней дремотой (IDE спала весь день) - уснуть заново.
    expect(napMove(asleep, at(17, 20))).toEqual({ kind: 'sleep', until: at(18, 10) })
  })

  it('wakes when the window opens, the hours go or the queue is closed', () => {
    const asleep = fallAsleep(queueOf({}), at(16, 19), at(17, 10), '')

    expect(napMove(asleep, at(17, 10))).toEqual({ kind: 'wake' })
    expect(napMove(setHours(asleep, null), at(16, 22))).toEqual({ kind: 'wake' })
    expect(napMove({ ...asleep, closedAt: 5 }, at(16, 22))).toEqual({ kind: 'wake' })
    expect(wakeUp(asleep).nap).toBeNull()
  })

  it('moves the wake-up when the hours change during a nap', () => {
    const asleep = fallAsleep(queueOf({}), at(16, 19), at(17, 10), '')
    const earlier = setHours(asleep, { ...HOURS, from: 8 * 60 })

    expect(napMove(earlier, at(16, 22))).toEqual({ kind: 'retime', until: at(17, 8) })
  })

  it('keeps the run cut by an IDE restart until the queue wakes', () => {
    const first = fallAsleep(queueOf({}), at(16, 19), at(17, 10), 'r1')
    const again = fallAsleep(first, at(17, 20), at(18, 10), '')

    expect(again.nap).toEqual({ at: at(17, 20), until: at(18, 10), runId: 'r1' })
    expect(forgetNapRun(again, 'other')).toBe(again)
    expect(forgetNapRun(again, 'r1').nap?.runId).toBe('')
  })

  it('starts nothing while resting, even before the nap is taken', () => {
    const queue = queueOf({}, item('a'))

    expect(nextToStart(queue, at(16, 12))?.id).toBe('a')
    expect(isResting(queue, at(16, 19, 0))).toBe(true)
    expect(nextToStart(queue, at(16, 19, 0))).toBeNull()
    expect(nextToStart(fallAsleep(queue, at(16, 19), at(17, 10), ''), at(17, 10))).toBeNull()
  })

  it('holds the queue when the paused run cannot go on', () => {
    const queue = queueOf({}, item('a', { runId: 'r1', state: 'stopped' }), item('b'))
    const held = missedWake(queue, 'r1', 7)

    expect(held.hold).toEqual({ reason: 'interrupted', itemId: 'a', at: 7 })
    expect(
      missedWake(queueOf({}, item('a', { runId: 'r1', state: 'stopped' })), 'r1', 7).hold,
    ).toBeNull()
  })

  it('lets a run paused by the hours survive an IDE restart without a hold', () => {
    const running = item('a', { runId: 'r1', state: 'running' })
    const napping = fallAsleep(queueOf({}, running, item('b')), at(16, 19), at(17, 10), 'r1')
    const recovered = recoverQueue(napping, () => 'stopped', at(16, 23))

    expect(recovered.hold).toBeNull()
    expect(recovered.items[0]?.state).toBe('stopped')
    expect(recovered.nap?.runId).toBe('r1')
    // Ночью несделанный перед ждущим - это не провал: очередь не встаёт, а ждёт утра.
    expect(holdBeforeFailure(recovered, at(16, 23))).toBe(recovered)

    // IDE упала, а не вышла: запись прогона - «упал», но спавший прогон всё равно продолжат.
    const crashed = recoverQueue(napping, () => 'failed', at(16, 23))

    expect(crashed.hold).toBeNull()
    expect(crashed.items[0]?.state).toBe('stopped')
    expect(crashed.nap?.runId).toBe('r1')

    const awake = recoverQueue(queueOf({ hours: null }, running, item('b')), () => 'stopped', 9)

    expect(awake.hold?.reason).toBe('interrupted')
  })

  it('plans the next boundary of the hours', () => {
    expect(nextHoursMove(queueOf({}), at(16, 12))).toBe(at(16, 19))
    expect(nextHoursMove(fallAsleep(queueOf({}), at(16, 19), at(17, 10), ''), at(16, 20))).toBe(
      at(17, 10),
    )
    expect(nextHoursMove(queueOf({ hours: null }), at(16, 12))).toBe(0)
  })

  it('reads hours and naps from disk, and drops hours without days', () => {
    const raw = {
      ...queueOf({}),
      hours: { from: 600, to: 1140, days: [5, 1] },
      nap: { at: 3, until: 4, runId: 'r1' },
    }

    expect(parseQueue(raw)?.hours).toEqual({ from: 600, to: 1140, days: [1, 5] })
    expect(parseQueue(raw)?.nap).toEqual({ at: 3, until: 4, runId: 'r1' })
    expect(parseQueue({ ...raw, hours: { from: 600, to: 1140, days: [] } })?.hours).toBeNull()
    expect(parseQueue({ ...raw, hours: undefined, nap: undefined })?.nap).toBeNull()
  })
})
