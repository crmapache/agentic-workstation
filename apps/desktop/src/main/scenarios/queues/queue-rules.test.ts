import { it, expect, describe } from 'vitest'

import type { QueueItem, ScenarioQueue } from '@shared/scenario-queues'

import {
  addItem,
  moveItem,
  closeQueue,
  removeItem,
  reopenItem,
  settleItem,
  markRefused,
  markStarted,
  nextToStart,
  renameQueue,
  resumeQueue,
  fallbackName,
  recoverQueue,
  setStopAfter,
} from './queue-rules'

const item = (id: string, patch: Partial<QueueItem> = {}): QueueItem => ({
  id,
  scenarioId: `s-${id}`,
  scope: 'project',
  scenarioName: `Scenario ${id}`,
  inputs: {},
  provider: 'claude',
  afterSuccess: true,
  addedAt: 1,
  runId: '',
  state: 'waiting',
  refusal: null,
  ...patch,
})

const queueOf = (...items: QueueItem[]): ScenarioQueue => ({
  id: 'q',
  projectPath: '/p',
  name: 'Q',
  nameSource: 'fallback',
  createdAt: 1,
  closedAt: 0,
  workdir: { kind: 'project' },
  items,
  stopAfterItemId: '',
  hold: null,
})

const ids = (queue: ScenarioQueue) => queue.items.map((one) => one.id)

describe('queue rules', () => {
  it('starts the first waiting item and nothing while one is running', () => {
    const queue = queueOf(item('a'), item('b'))

    expect(nextToStart(queue)?.id).toBe('a')

    const started = markStarted(queue, 'a', 'run-a')

    expect(started.items[0]).toMatchObject({ state: 'running', runId: 'run-a' })
    expect(nextToStart(started)).toBeNull()
  })

  it('moves on after a success and after a failure the next one does not wait for', () => {
    const done = settleItem(markStarted(queueOf(item('a'), item('b')), 'a', 'r'), 'a', 'done', 5)

    expect(done.hold).toBeNull()
    expect(nextToStart(done)?.id).toBe('b')

    const failed = settleItem(
      markStarted(queueOf(item('a'), item('b', { afterSuccess: false })), 'a', 'r'),
      'a',
      'failed',
      5,
    )

    expect(failed.hold).toBeNull()
    expect(nextToStart(failed)?.id).toBe('b')
  })

  it('holds on a failure when the next item waits for success, until Resume', () => {
    const held = settleItem(markStarted(queueOf(item('a'), item('b')), 'a', 'r'), 'a', 'failed', 5)

    expect(held.hold).toEqual({ reason: 'failed', itemId: 'a', at: 5 })
    expect(nextToStart(held)).toBeNull()
    expect(nextToStart(resumeQueue(held))?.id).toBe('b')
  })

  it('stops after the current item whatever its outcome, and forgets the mark', () => {
    for (const outcome of ['done', 'failed', 'stopped'] as const) {
      const running = markStarted(queueOf(item('a'), item('b', { afterSuccess: false })), 'a', 'r')
      const held = settleItem(setStopAfter(running, 'a'), 'a', outcome, 9)

      expect(held.hold).toEqual({ reason: 'stopAfter', itemId: 'a', at: 9 })
      expect(held.stopAfterItemId).toBe('')
      expect(nextToStart(held)).toBeNull()
      expect(nextToStart(resumeQueue(held))?.id).toBe('b')
    }
  })

  it('stops after a chosen waiting item, not before it', () => {
    let queue = setStopAfter(markStarted(queueOf(item('a'), item('b'), item('c')), 'a', 'r1'), 'b')

    queue = settleItem(queue, 'a', 'done', 1)
    expect(queue.hold).toBeNull()
    expect(nextToStart(queue)?.id).toBe('b')

    queue = settleItem(markStarted(queue, 'b', 'r2'), 'b', 'done', 2)
    expect(queue.hold?.reason).toBe('stopAfter')
    expect(nextToStart(queue)).toBeNull()
  })

  it('does not mark a finished item and clears the mark with null', () => {
    const queue = settleItem(markStarted(queueOf(item('a'), item('b')), 'a', 'r'), 'a', 'done', 1)

    expect(setStopAfter(queue, 'a').stopAfterItemId).toBe('')
    expect(setStopAfter(setStopAfter(queue, 'b'), null).stopAfterItemId).toBe('')
  })

  it('keeps a refused item first with its reason and retries it on Resume', () => {
    const refused = markRefused(queueOf(item('a'), item('b')), 'a', 'scenarioBroken', 3)

    expect(refused.items[0]?.refusal).toBe('scenarioBroken')
    expect(nextToStart(refused)).toBeNull()

    const resumed = resumeQueue(refused)

    expect(resumed.items[0]?.refusal).toBeNull()
    expect(nextToStart(resumed)?.id).toBe('a')
  })

  it('removes only waiting items, taking their stop mark and refusal hold along', () => {
    const running = markStarted(queueOf(item('a'), item('b')), 'a', 'r')

    expect(ids(removeItem(running, 'a'))).toEqual(['a', 'b'])

    const marked = removeItem(setStopAfter(running, 'b'), 'b')

    expect(ids(marked)).toEqual(['a'])
    expect(marked.stopAfterItemId).toBe('')

    const refused = removeItem(
      markRefused(queueOf(item('a'), item('b')), 'a', 'scenarioGone', 1),
      'a',
    )

    expect(refused.hold).toBeNull()
    expect(nextToStart(refused)?.id).toBe('b')
  })

  it('moves waiting items among waiting ones only', () => {
    const queue = markStarted(queueOf(item('a'), item('b'), item('c'), item('d')), 'a', 'r')

    expect(ids(moveItem(queue, 'd', -1))).toEqual(['a', 'b', 'd', 'c'])
    expect(ids(moveItem(queue, 'd', -10))).toEqual(['a', 'd', 'b', 'c'])
    expect(ids(moveItem(queue, 'a', 1))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('lets a person name the queue over the AI and gives it back on an empty name', () => {
    const ai = renameQueue(queueOf(), 'Fix the login page', 'ai')

    expect(ai).toMatchObject({ name: 'Fix the login page', nameSource: 'ai' })

    const mine = renameQueue(ai, '  My   name ', 'user')

    expect(mine).toMatchObject({ name: 'My name', nameSource: 'user' })
    expect(renameQueue(mine, 'Other', 'ai').name).toBe('My name')
    expect(renameQueue(mine, '', 'user').nameSource).toBe('fallback')
  })

  it('closes only an idle queue and takes nothing more into it', () => {
    const running = markStarted(queueOf(item('a')), 'a', 'r')

    expect(closeQueue(running, 1)).toBeNull()

    const closed = closeQueue(settleItem(running, 'a', 'done', 1), 2)

    expect(closed?.closedAt).toBe(2)
    expect(closed && addItem(closed, item('b')).items).toHaveLength(1)
    expect(closed && nextToStart(closed)).toBeNull()
  })

  it('continues only the last finished item that did not succeed', () => {
    let queue = settleItem(markStarted(queueOf(item('a'), item('b')), 'a', 'r1'), 'a', 'stopped', 1)

    expect(reopenItem(queue, 'a')?.items[0]?.state).toBe('running')
    expect(reopenItem(queue, 'a')?.hold).toBeNull()

    queue = settleItem(markStarted(resumeQueue(queue), 'b', 'r2'), 'b', 'done', 2)
    expect(reopenItem(queue, 'a')).toBeNull()
    expect(reopenItem(queue, 'b')).toBeNull()
  })

  it('settles an item cut by an IDE restart and holds the queue behind it', () => {
    const queue = markStarted(queueOf(item('a'), item('b')), 'a', 'r1')
    const recovered = recoverQueue(queue, () => 'stopped', 7)

    expect(recovered.items[0]?.state).toBe('stopped')
    expect(recovered.hold).toEqual({ reason: 'interrupted', itemId: 'a', at: 7 })

    const alone = recoverQueue(markStarted(queueOf(item('a')), 'a', 'r1'), () => 'done', 7)

    expect(alone.items[0]?.state).toBe('done')
    expect(alone.hold).toBeNull()
    expect(recoverQueue(queue, () => null, 7).items[0]?.state).toBe('stopped')
  })

  it('names a queue by its scenario and first answer until the AI does', () => {
    expect(fallbackName('Review PR', { url: 'https://github.com/a/b/pull/12' })).toBe(
      'Review PR · 12',
    )
    expect(fallbackName('Review PR', { a: ' ', b: 'auth module' })).toBe('Review PR · auth module')
    expect(fallbackName('Tidy', {})).toBe('Tidy')
  })
})
