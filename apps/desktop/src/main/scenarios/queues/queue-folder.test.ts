import { it, expect, describe } from 'vitest'

import type { QueueItem, ScenarioQueue } from '@shared/scenario-queues'

import {
  inLine,
  hasTurn,
  takeTurn,
  folderLine,
  settleTurn,
  folderLines,
  holdsFolder,
  isFolderFree,
  runAlongside,
  recoverWithTurn,
} from './queue-folder'
import { parseQueue } from './queue-parse'
import { closeQueue, resumeQueue, clearWaiting, recoverQueue, markDoneByHand } from './queue-rules'

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

const queueOf = (
  id: string,
  patch: Partial<ScenarioQueue>,
  ...items: QueueItem[]
): ScenarioQueue => ({
  id,
  projectPath: '/p',
  name: id.toUpperCase(),
  nameSource: 'fallback',
  createdAt: 1,
  activeAt: 1,
  closedAt: 0,
  workdir: { kind: 'project' },
  items,
  stopAfterItemId: '',
  hold: null,
  hours: null,
  nap: null,
  turn: null,
  ...patch,
})

const NOW = 1_000

const running = (id: string) => item(id, { state: 'running', runId: `r-${id}` })

const done = (id: string) => item(id, { state: 'done', runId: `r-${id}` })

/** Окно часов в другой день недели: сейчас точно вне него. */
const elsewhere = () => ({
  from: 9 * 60,
  to: 10 * 60,
  days: [((new Date(NOW).getDay() + 3) % 7) + 1],
})

const worktree = {
  kind: 'worktree' as const,
  path: '/w',
  projectDir: '/w',
  gitBranch: 'scenarios/w',
  baseCommit: 'abc',
  removed: false,
}

describe('queue folder', () => {
  it('a queue whose scenario runs holds the folder, a new one in it waits its turn', () => {
    const first = queueOf('a', {}, running('a1'))
    const second = queueOf('b', {}, item('b1'))
    const turned = takeTurn(second, [first, second], NOW)

    expect(holdsFolder(first, NOW)).toBe(true)
    expect(turned.turn).toEqual({ kind: 'waiting', at: NOW })
    expect(hasTurn(turned)).toBe(false)
    expect(takeTurn(first, [first, second], NOW).turn).toEqual({ kind: 'holding', at: NOW })
  })

  it('the holder keeps the folder between its own items: one added while it ran goes first', () => {
    const first = queueOf('a', { turn: { kind: 'holding', at: 5 } }, done('a1'), item('a2'))
    const second = queueOf('b', { turn: { kind: 'waiting', at: 6 } }, item('b1'))
    const all = [first, second]

    expect(holdsFolder(first, NOW)).toBe(true)
    expect(takeTurn(first, all, NOW)).toBe(first)
    expect(hasTurn(first)).toBe(true)
    expect(takeTurn(second, all, NOW)).toBe(second)
  })

  it('done with its last item, the holder lets go and the first in line gets the folder', () => {
    const first = queueOf('a', { turn: { kind: 'holding', at: 5 } }, done('a1'))
    const second = queueOf('b', { turn: { kind: 'waiting', at: 6 } }, item('b1'))
    const all = [first, second]

    expect(holdsFolder(first, NOW)).toBe(false)
    expect(takeTurn(first, all, NOW).turn).toBeNull()
    expect(takeTurn(second, all, NOW).turn).toEqual({ kind: 'holding', at: NOW })
  })

  it('a queue added to after it let go waits behind the ones already in line', () => {
    const first = queueOf('a', {}, done('a1'), item('a2'))
    const second = queueOf('b', { turn: { kind: 'waiting', at: 6 } }, item('b1'))
    const all = [first, second]

    expect(takeTurn(first, all, NOW).turn).toEqual({ kind: 'waiting', at: NOW })
    expect(takeTurn(second, all, NOW).turn).toEqual({ kind: 'holding', at: NOW })
  })

  it('a free folder is taken at once', () => {
    const only = queueOf('a', {}, item('a1'))

    expect(isFolderFree([only], '/p', NOW)).toBe(true)
    expect(takeTurn(only, [only], NOW).turn).toEqual({ kind: 'holding', at: NOW })
  })

  it('a holder on an unfinished item keeps the folder until it is continued, marked done or closed', () => {
    const stuck = queueOf(
      'a',
      { turn: { kind: 'holding', at: 5 } },
      item('a1', { state: 'failed', runId: 'r' }),
    )
    const second = queueOf('b', { turn: { kind: 'waiting', at: 6 } }, item('b1'))

    expect(holdsFolder(stuck, NOW)).toBe(true)
    expect(takeTurn(second, [stuck, second], NOW)).toBe(second)

    const marked = markDoneByHand(stuck, 'a1', NOW)

    expect(holdsFolder(marked, NOW)).toBe(false)
    expect(takeTurn(second, [marked, second], NOW).turn?.kind).toBe('holding')

    const closed = closeQueue(stuck, NOW) as ScenarioQueue

    expect(holdsFolder(closed, NOW)).toBe(false)
    expect(takeTurn(second, [closed, second], NOW).turn?.kind).toBe('holding')
  })

  it('a holder stopped after a done item lets go; resumed, it waits like a new one', () => {
    const stopped = queueOf(
      'a',
      { turn: { kind: 'holding', at: 5 }, hold: { reason: 'stopAfter', itemId: 'a1', at: 7 } },
      done('a1'),
      item('a2'),
    )
    const second = queueOf('b', { turn: { kind: 'waiting', at: 6 } }, item('b1'))

    const letGo = takeTurn(stopped, [stopped, second], NOW)

    expect(holdsFolder(stopped, NOW)).toBe(false)
    expect(letGo.turn).toBeNull()
    expect(takeTurn(resumeQueue(letGo), [letGo, second], NOW).turn).toEqual({
      kind: 'waiting',
      at: NOW,
    })
  })

  it('waits in order of joining the line, not of creation; a dropped one gives way', () => {
    const holder = queueOf('a', {}, running('a1'))
    const older = queueOf('b', { createdAt: 0, turn: { kind: 'waiting', at: 30 } }, item('b1'))
    const newer = queueOf('c', { createdAt: 9, turn: { kind: 'waiting', at: 20 } }, item('c1'))
    const third = queueOf('d', { turn: { kind: 'waiting', at: 40 } }, item('d1'))
    const all = [holder, older, newer, third]

    expect(folderLine(all, '/p', NOW).map((one) => one.id)).toEqual(['c', 'b', 'd'])

    const free = [queueOf('a', {}, done('a1')), older, clearWaiting(newer), third]

    expect(inLine(clearWaiting(newer), NOW)).toBe(false)
    expect(takeTurn(third, free, NOW)).toBe(third)
    expect(takeTurn(older, free, NOW).turn?.kind).toBe('holding')
  })

  it('a queue in its own worktree neither holds the folder nor waits for it', () => {
    const holder = queueOf('a', {}, running('a1'))
    const apart = queueOf('w', { workdir: worktree }, running('w1'), item('w2'))
    const waiting = queueOf('b', {}, item('b1'))

    expect(holdsFolder(apart, NOW)).toBe(false)
    expect(takeTurn(apart, [holder, apart], NOW).turn).toBeNull()
    expect(hasTurn(apart)).toBe(true)
    expect(takeTurn(waiting, [apart, waiting], NOW).turn?.kind).toBe('holding')
  })

  it('a queue resting outside its hours with nothing paused neither holds nor keeps a place', () => {
    const resting = queueOf(
      'a',
      { hours: elsewhere(), turn: { kind: 'waiting', at: 2 } },
      item('a1'),
    )
    const later = queueOf('b', { turn: { kind: 'waiting', at: 3 } }, item('b1'))
    const all = [resting, later]

    expect(holdsFolder(resting, NOW)).toBe(false)
    expect(inLine(resting, NOW)).toBe(false)
    expect(takeTurn(resting, all, NOW).turn).toBeNull()
    expect(takeTurn(later, all, NOW).turn?.kind).toBe('holding')
  })

  it('a queue asleep with its run paused holds the folder, and two such never wait for each other', () => {
    const nap = { at: 1, until: NOW + 10, runId: 'r-a1' }
    const first = queueOf('a', { hours: elsewhere(), nap }, running('a1'))
    const second = queueOf(
      'b',
      { hours: elsewhere(), nap: { ...nap, runId: 'r-b1' } },
      running('b1'),
    )
    const all = [first, second]

    expect(holdsFolder(first, NOW)).toBe(true)
    expect(hasTurn(takeTurn(first, all, NOW))).toBe(true)
    expect(hasTurn(takeTurn(second, all, NOW))).toBe(true)
  })

  it('after an IDE restart mid-run the holder still holds: its cut item is unfinished', () => {
    const cut = recoverQueue(queueOf('a', {}, running('a1'), item('a2')), () => 'stopped', NOW)
    const second = queueOf('b', { turn: { kind: 'waiting', at: 6 } }, item('b1'))

    expect(cut.hold?.reason).toBe('interrupted')
    expect(holdsFolder(cut, NOW)).toBe(true)
    expect(takeTurn(second, [cut, second], NOW)).toBe(second)
  })

  it('after an IDE restart a holder whose cut item ended done lets go; one cut short keeps the folder', () => {
    const holding = { kind: 'holding' as const, at: 5 }
    const ended = recoverWithTurn(
      queueOf('a', { turn: holding }, running('a1'), item('a2')),
      () => 'done',
      NOW,
    )
    const cut = recoverWithTurn(
      queueOf('a', { turn: holding }, running('a1'), item('a2')),
      () => 'stopped',
      NOW,
    )

    expect(ended.hold?.reason).toBe('interrupted')
    expect(ended.turn).toBeNull()
    expect(cut.turn).toEqual(holding)
    expect(
      settleTurn(queueOf('b', { turn: { kind: 'waiting', at: 2 } }, done('b1')), NOW).turn,
    ).toBeNull()
  })

  it('run alongside takes the folder now and leaves the others where they stand', () => {
    const holder = queueOf('a', {}, running('a1'))
    const first = queueOf('b', { turn: { kind: 'waiting', at: 2 } }, item('b1'))
    const second = queueOf('c', { turn: { kind: 'waiting', at: 3 } }, item('c1'))
    const beside = runAlongside(second, NOW)
    const all = [holder, first, beside]

    expect(beside.turn).toEqual({ kind: 'holding', at: NOW })
    expect(hasTurn(takeTurn(beside, all, NOW))).toBe(true)
    expect(folderLine(all, '/p', NOW).map((one) => one.id)).toEqual(['b'])
    expect(takeTurn(first, all, NOW)).toBe(first)
    expect(runAlongside(holder, NOW)).toBe(holder)
  })

  it('tells which folders are taken: holders and the line in order', () => {
    const holder = queueOf('a', {}, running('a1'))
    const first = queueOf('b', { turn: { kind: 'waiting', at: 2 } }, item('b1'))
    const idle = queueOf('c', {}, done('c1'))
    const other = queueOf('d', { projectPath: '/q' }, done('d1'))

    expect(folderLines([holder, first, idle, other], NOW)).toEqual([
      { projectPath: '/p', holders: ['a'], line: ['b'] },
    ])
    expect(isFolderFree([holder, first, idle, other], '/q', NOW)).toBe(true)
    expect(isFolderFree([holder, first, idle, other], '/p', NOW)).toBe(false)
  })
})

describe('queue folder from disk', () => {
  const raw = (patch: Record<string, unknown>) => ({
    id: 'q',
    projectPath: '/p',
    name: 'Q',
    createdAt: 1,
    closedAt: 0,
    workdir: { kind: 'project' },
    items: [{ id: 'i', scenarioId: 's', state: 'waiting' }],
    stopAfterItemId: '',
    hold: null,
    hours: null,
    nap: null,
    ...patch,
  })

  it('reads its place, and an old file without one as no place', () => {
    expect(parseQueue(raw({ turn: { kind: 'waiting', at: 7 } }))?.turn).toEqual({
      kind: 'waiting',
      at: 7,
    })
    expect(parseQueue(raw({}))?.turn).toBeNull()
    expect(parseQueue(raw({ turn: { kind: 'odd' } }))?.turn).toBeNull()
  })

  it('an old queue asleep without hours and without a paused run waits from when it fell asleep', () => {
    const nap = { at: 42, until: 50, runId: '' }
    const legacy = parseQueue(raw({ nap }))

    expect(legacy?.turn).toEqual({ kind: 'waiting', at: 42 })
    expect(legacy?.nap).toBeNull()
    expect(parseQueue(raw({ nap: { ...nap, runId: 'r' } }))?.nap?.runId).toBe('r')
    expect(parseQueue(raw({ nap, turn: null }))?.nap).toEqual(nap)
    expect(parseQueue(raw({ nap, workdir: { kind: 'worktree', path: '/w' } }))?.turn).toBeNull()
  })

  it('an old queue asleep within its hours past its wake time waits from when it fell asleep too', () => {
    const hours = { from: 9 * 60, to: 10 * 60, days: [1] }
    const overdue = parseQueue(raw({ hours, nap: { at: 42, until: Date.now() - 1000, runId: '' } }))
    const ahead = parseQueue(raw({ hours, nap: { at: 42, until: Date.now() + 60_000, runId: '' } }))

    expect(overdue?.turn).toEqual({ kind: 'waiting', at: 42 })
    expect(overdue?.nap).toBeNull()
    expect(ahead?.turn).toBeNull()
    expect(ahead?.nap?.at).toBe(42)
  })
})
