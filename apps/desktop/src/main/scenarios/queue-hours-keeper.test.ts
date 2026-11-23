import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import type { QueueItem, ScenarioQueue } from '@shared/scenario-queues'
import type { ScenarioCode } from '@shared/scenarios'

import { JsonFile } from '../storage/json-file'
import { QueueHoursKeeper } from './queue-hours-keeper'
import type { RunDesk } from './run-desk'
import { QueueBook } from './queues/queue-book'
import type { StoredQueues } from './queues/queue-parse'

/** Местное время: 16 ноября 2026 - понедельник. */
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime()

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
  hours: { from: 10 * 60, to: 19 * 60, days: [1, 2, 3, 4, 5] },
  nap: null,
  ...patch,
})

let dir = ''
/** Книжки проверки: их записи на диск дожидаются, прежде чем убрать папку. */
let books: QueueBook[] = []

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'queue-hours-'))
})

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(books.map((book) => book.settle()))
  books = []
  await rm(dir, { recursive: true, force: true })
})

/** Исполнитель часов на настоящей книжке очередей и подделке стола прогонов. */
const keeperOf = async (
  queue: ScenarioQueue,
  {
    live = [] as string[],
    pauses = true,
    carryOn = (): Promise<ScenarioCode | null> => Promise.resolve(null),
    folderTaken = false,
  } = {},
) => {
  const book = await QueueBook.load(new JsonFile<StoredQueues>(join(dir, 'queues.json')))
  const desk = {
    live: new Map(live.map((runId) => [runId, {}])),
    pauseForHours: vi.fn(() => pauses),
    control: vi.fn(() => null),
  }
  const host = {
    book,
    desk: () => desk as unknown as RunDesk,
    onQueues: vi.fn(),
    notify: vi.fn(),
    carryOn: vi.fn(carryOn),
    step: vi.fn(() => Promise.resolve()),
    folderTaken: vi.fn(() => folderTaken),
  }

  book.put(queue)
  books.push(book)

  return { book, desk, host, keeper: new QueueHoursKeeper(host) }
}

describe('queue hours keeper', () => {
  it('pauses the running run when the hours are over and remembers it', async () => {
    const running = item('a', { runId: 'r1', state: 'running' })
    const { book, desk, keeper } = await keeperOf(queueOf({}, running), { live: ['r1'] })

    await keeper.keep('q', at(16, 19, 1))

    expect(desk.pauseForHours).toHaveBeenCalledWith('r1')
    expect(book.get('q')?.nap).toEqual({ at: at(16, 19, 1), until: at(17, 10), runId: 'r1' })
    keeper.stop()
  })

  it('leaves a run the person paused to the person', async () => {
    const running = item('a', { runId: 'r1', state: 'running' })
    const { book, keeper } = await keeperOf(queueOf({}, running), { live: ['r1'], pauses: false })

    await keeper.keep('q', at(16, 19, 1))

    expect(book.get('q')?.nap?.runId).toBe('')
    keeper.stop()
  })

  it('resumes its own paused run when the hours begin', async () => {
    const running = item('a', { runId: 'r1', state: 'running' })
    const nap = { at: at(16, 19), until: at(17, 10), runId: 'r1' }
    const { book, desk, keeper } = await keeperOf(queueOf({ nap }, running), { live: ['r1'] })

    await keeper.keep('q', at(17, 10))

    expect(desk.control).toHaveBeenCalledWith('r1', 'resume')
    expect(book.get('q')?.nap).toBeNull()
    keeper.stop()
  })

  it('does not resume a run the person took over at night', async () => {
    const running = item('a', { runId: 'r1', state: 'running' })
    const nap = { at: at(16, 19), until: at(17, 10), runId: 'r1' }
    const { desk, keeper } = await keeperOf(queueOf({ nap }, running), { live: ['r1'] })

    keeper.touched('r1')
    await keeper.keep('q', at(17, 10))

    expect(desk.control).not.toHaveBeenCalled()
    keeper.stop()
  })

  it('carries on a run cut by an IDE restart, and holds when it cannot', async () => {
    const stopped = item('a', { runId: 'r1', state: 'stopped' })
    const nap = { at: at(16, 19), until: at(17, 10), runId: 'r1' }
    const fine = await keeperOf(queueOf({ nap }, stopped, item('b')))

    await fine.keeper.keep('q', at(17, 10))

    expect(fine.host.carryOn).toHaveBeenCalledWith('r1')
    expect(fine.book.get('q')?.hold).toBeNull()
    fine.keeper.stop()

    const refused = await keeperOf(queueOf({ nap }, stopped, item('b')), {
      carryOn: () => Promise.resolve('worktreeFailed'),
    })

    await refused.keeper.keep('q', at(17, 10))

    expect(refused.book.get('q')?.hold?.reason).toBe('interrupted')
    expect(refused.book.get('q')?.nap).toBeNull()
    expect(refused.host.notify).toHaveBeenCalledOnce()
    refused.keeper.stop()
  })

  it('tells the person when a lone paused run cannot go on in the morning', async () => {
    const stopped = item('a', { runId: 'r1', state: 'stopped' })
    const nap = { at: at(16, 19), until: at(17, 10), runId: 'r1' }
    const { book, host, keeper } = await keeperOf(queueOf({ nap }, stopped), {
      carryOn: () => Promise.resolve('runNotResumable'),
    })

    await keeper.keep('q', at(17, 10))

    // Ждущих нет - очередь не встаёт, но человек узнаёт, что утро не задалось.
    expect(book.get('q')?.hold).toBeNull()
    expect(book.get('q')?.nap).toBeNull()
    expect(host.notify).toHaveBeenCalledOnce()
    keeper.stop()
  })

  it('stays asleep while another queue works in the project folder', async () => {
    const running = item('a', { runId: 'r1', state: 'running' })
    const nap = { at: at(16, 19), until: at(17, 10), runId: 'r1' }
    const { book, desk, keeper } = await keeperOf(queueOf({ nap }, running, item('b')), {
      live: ['r1'],
      folderTaken: true,
    })

    await keeper.keep('q', at(17, 10))

    expect(desk.control).not.toHaveBeenCalled()
    expect(book.get('q')?.nap).toEqual(nap)
    keeper.stop()
  })

  it('steps the queue right at the boundary of its window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(at(16, 18, 59))

    const { host, keeper } = await keeperOf(queueOf({}))

    await keeper.keep('q', Date.now())
    vi.advanceTimersByTime(30_000)
    expect(host.step).not.toHaveBeenCalled()

    vi.advanceTimersByTime(60_000)
    expect(host.step).toHaveBeenCalledWith('q')
    keeper.stop()
  })
})
