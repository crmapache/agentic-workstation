import { it, expect, describe } from 'vitest'

import type { QueueItem, ScenarioQueue } from '@shared/scenario-queues'
import { QUEUE_IDLE_CLOSE_MS } from '@shared/scenario-queues'

import {
  addItem,
  moveItem,
  closeQueue,
  removeItem,
  reopenItem,
  settleItem,
  withRunsOn,
  markRefused,
  markStarted,
  nextToStart,
  renameQueue,
  resumeQueue,
  clearWaiting,
  fallbackName,
  recoverQueue,
  resumeTarget,
  setStopAfter,
  isIdleTooLong,
  markDoneByHand,
  passPlaceholders,
  holdBeforeFailure,
} from './queue-rules'

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

const queueOf = (...items: QueueItem[]): ScenarioQueue => ({
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
  hours: null,
  nap: null,
})

/** Время проверок, где часы очереди не участвуют: у очереди их нет. */
const NOW = 1

const ids = (queue: ScenarioQueue) => queue.items.map((one) => one.id)

describe('queue rules', () => {
  it('starts the first waiting item and nothing while one is running', () => {
    const queue = queueOf(item('a'), item('b'))

    expect(nextToStart(queue, NOW)?.id).toBe('a')

    const started = markStarted(queue, 'a', 'run-a')

    expect(started.items[0]).toMatchObject({ state: 'running', runId: 'run-a' })
    expect(nextToStart(started, NOW)).toBeNull()
  })

  it('moves on after a success', () => {
    const done = settleItem(markStarted(queueOf(item('a'), item('b')), 'a', 'r'), 'a', 'done', 5)

    expect(done.hold).toBeNull()
    expect(nextToStart(done, NOW)?.id).toBe('b')
  })

  it('holds on an item that failed or was stopped, and Resume does not go past it', () => {
    for (const outcome of ['failed', 'stopped'] as const) {
      const held = settleItem(markStarted(queueOf(item('a'), item('b')), 'a', 'r'), 'a', outcome, 5)

      expect(held.hold).toEqual({ reason: 'failed', itemId: 'a', at: 5 })
      expect(nextToStart(held, NOW)).toBeNull()
      expect(resumeTarget(held)?.id).toBe('a')
      // Снятая остановка ничего не пускает: перед ждущим всё ещё недоделанный.
      expect(nextToStart(resumeQueue(held), NOW)).toBeNull()
    }
  })

  it('stops after the current item when it is done, and forgets the mark', () => {
    const running = markStarted(queueOf(item('a'), item('b')), 'a', 'r')
    const held = settleItem(setStopAfter(running, 'a'), 'a', 'done', 9)

    expect(held.hold).toEqual({ reason: 'stopAfter', itemId: 'a', at: 9 })
    expect(held.stopAfterItemId).toBe('')
    expect(nextToStart(held, NOW)).toBeNull()
    expect(resumeTarget(held)).toBeNull()
    expect(nextToStart(resumeQueue(held), NOW)?.id).toBe('b')
  })

  it('keeps the stop mark on an unfinished item and stops after it once it is done', () => {
    const running = markStarted(queueOf(item('a'), item('b')), 'a', 'r')
    const failed = settleItem(setStopAfter(running, 'a'), 'a', 'failed', 9)

    expect(failed.hold).toEqual({ reason: 'failed', itemId: 'a', at: 9 })
    expect(failed.stopAfterItemId).toBe('a')

    const reopened = reopenItem(failed, 'a')
    const done = reopened && settleItem(reopened, 'a', 'done', 10)

    expect(done?.hold).toEqual({ reason: 'stopAfter', itemId: 'a', at: 10 })
    expect(done && nextToStart(done, NOW)).toBeNull()
  })

  it('stops after a chosen waiting item, not before it', () => {
    let queue = setStopAfter(markStarted(queueOf(item('a'), item('b'), item('c')), 'a', 'r1'), 'b')

    queue = settleItem(queue, 'a', 'done', 1)
    expect(queue.hold).toBeNull()
    expect(nextToStart(queue, NOW)?.id).toBe('b')

    queue = settleItem(markStarted(queue, 'b', 'r2'), 'b', 'done', 2)
    expect(queue.hold?.reason).toBe('stopAfter')
    expect(nextToStart(queue, NOW)).toBeNull()
  })

  it('does not mark a finished item and clears the mark with null', () => {
    const queue = settleItem(markStarted(queueOf(item('a'), item('b')), 'a', 'r'), 'a', 'done', 1)

    expect(setStopAfter(queue, 'a').stopAfterItemId).toBe('')
    expect(setStopAfter(setStopAfter(queue, 'b'), null).stopAfterItemId).toBe('')
  })

  it('keeps a refused item first with its reason and retries it on Resume', () => {
    const refused = markRefused(queueOf(item('a'), item('b')), 'a', 'scenarioBroken', 3)

    expect(refused.items[0]?.refusal).toBe('scenarioBroken')
    expect(nextToStart(refused, NOW)).toBeNull()

    const resumed = resumeQueue(refused)

    expect(resumed.items[0]?.refusal).toBeNull()
    expect(nextToStart(resumed, NOW)?.id).toBe('a')
  })

  it('clears every waiting item at once, keeping the running one and the queue open', () => {
    const running = markStarted(queueOf(item('a'), item('b'), item('c')), 'a', 'r')
    const cleared = clearWaiting(setStopAfter(running, 'c'))

    expect(ids(cleared)).toEqual(['a'])
    expect(cleared.stopAfterItemId).toBe('')
    expect(cleared.closedAt).toBe(0)
    expect(clearWaiting(cleared)).toBe(cleared)

    const refused = clearWaiting(markRefused(queueOf(item('a'), item('b')), 'a', 'scenarioGone', 1))

    expect(refused.items).toEqual([])
    expect(refused.hold).toBeNull()
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
    expect(nextToStart(refused, NOW)?.id).toBe('b')
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

    const cleared = renameQueue({ ...mine, items: [item('a')] }, '', 'user')

    expect(cleared).toMatchObject({ name: 'Scenario a', nameSource: 'fallback' })
    expect(renameQueue(cleared, 'From AI', 'ai').name).toBe('From AI')
  })

  it('does not start an item added after a failure, and holds on the failed one instead', () => {
    const failed = settleItem(markStarted(queueOf(item('a')), 'a', 'r1'), 'a', 'failed', 1)

    expect(failed.hold).toBeNull()
    expect(resumeTarget(failed)).toBeNull()

    const added = addItem(failed, item('b'))

    expect(nextToStart(added, NOW)).toBeNull()

    const held = holdBeforeFailure(added, 5)

    expect(held.hold).toEqual({ reason: 'failed', itemId: 'a', at: 5 })
    expect(resumeTarget(held)?.id).toBe('a')
    expect(nextToStart(resumeQueue(held), NOW)).toBeNull()
  })

  it('keeps the stop mark when a run stopped with nothing waiting is continued', () => {
    const stopped = settleItem(
      setStopAfter(markStarted(queueOf(item('a')), 'a', 'r'), 'a'),
      'a',
      'stopped',
      1,
    )

    expect(stopped.hold?.reason).toBe('stopAfter')

    const reopened = reopenItem(stopped, 'a')

    expect(reopened?.stopAfterItemId).toBe('a')

    const again = reopened && settleItem(addItem(reopened, item('b')), 'a', 'done', 2)

    expect(again?.hold?.reason).toBe('stopAfter')
    expect(again && nextToStart(again, NOW)).toBeNull()
  })

  it('goes on after a continued run is done, and not before', () => {
    const held = settleItem(markStarted(queueOf(item('a'), item('b')), 'a', 'r'), 'a', 'stopped', 1)
    const reopened = reopenItem(held, 'a')

    expect(reopened?.hold).toBeNull()
    expect(reopened && nextToStart(reopened, NOW)).toBeNull()

    const done = reopened && settleItem(reopened, 'a', 'done', 2)

    expect(done?.hold).toBeNull()
    expect(done && nextToStart(done, NOW)?.id).toBe('b')
  })

  it('closes only an idle queue and takes nothing more into it', () => {
    const running = markStarted(queueOf(item('a')), 'a', 'r')

    expect(closeQueue(running, 1)).toBeNull()

    const closed = closeQueue(settleItem(running, 'a', 'done', 1), 2)

    expect(closed?.closedAt).toBe(2)
    expect(closed && addItem(closed, item('b')).items).toHaveLength(1)
    expect(closed && nextToStart(closed, NOW)).toBeNull()
  })

  it('continues only the last finished item that did not succeed', () => {
    let queue = settleItem(markStarted(queueOf(item('a'), item('b')), 'a', 'r1'), 'a', 'stopped', 1)

    expect(reopenItem(queue, 'a')?.items[0]?.state).toBe('running')
    expect(reopenItem(queue, 'a')?.hold).toBeNull()

    queue = settleItem(markStarted(markDoneByHand(queue, 'a', 2), 'b', 'r2'), 'b', 'done', 3)
    expect(reopenItem(queue, 'a')).toBeNull()
    expect(reopenItem(queue, 'b')).toBeNull()
  })

  it('settles an item cut by an IDE restart and holds the queue behind it', () => {
    const queue = markStarted(queueOf(item('a'), item('b')), 'a', 'r1')
    const recovered = recoverQueue(queue, () => 'stopped', 7)

    expect(recovered.items[0]?.state).toBe('stopped')
    expect(recovered.hold).toEqual({ reason: 'interrupted', itemId: 'a', at: 7 })
    // Resume после выхода IDE продолжает оборванный, а не берёт следующий.
    expect(resumeTarget(recovered)?.id).toBe('a')

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

describe('marking a failed item done by hand', () => {
  it('turns a failed run into a success and keeps the queue waiting for Resume', () => {
    const held = settleItem(markStarted(queueOf(item('a'), item('b')), 'a', 'r'), 'a', 'failed', 5)
    const marked = markDoneByHand(held, 'a', 7)

    expect(marked.items[0]).toMatchObject({ state: 'done', doneByHand: true })
    expect(marked.hold).toEqual({ reason: 'stopAfter', itemId: 'a', at: 7 })
    expect(nextToStart(marked, NOW)).toBeNull()
    expect(resumeTarget(marked)).toBeNull()
    expect(nextToStart(resumeQueue(marked), NOW)?.id).toBe('b')
  })

  it('drops the stop mark the unfinished item kept', () => {
    const running = setStopAfter(markStarted(queueOf(item('a'), item('b')), 'a', 'r'), 'a')
    const marked = markDoneByHand(settleItem(running, 'a', 'failed', 5), 'a', 7)

    expect(marked.stopAfterItemId).toBe('')
    expect(marked.hold).toEqual({ reason: 'stopAfter', itemId: 'a', at: 7 })
  })

  it('drops the hold when nothing waits, and leaves a hold on another item alone', () => {
    const alone = settleItem(markStarted(queueOf(item('a')), 'a', 'r'), 'a', 'stopped', 5)

    expect(
      markDoneByHand({ ...alone, hold: { reason: 'failed', itemId: 'a', at: 5 } }, 'a', 7).hold,
    ).toBeNull()

    const two = queueOf(item('a', { state: 'failed' }), item('b', { state: 'failed' }), item('c'))
    const heldOnB = { ...two, hold: { reason: 'failed' as const, itemId: 'b', at: 5 } }

    expect(markDoneByHand(heldOnB, 'a', 7).hold).toEqual(heldOnB.hold)
  })

  it('touches only an item that failed or was stopped', () => {
    const queue = queueOf(item('a', { state: 'done' }), item('b', { state: 'running' }), item('c'))

    expect(markDoneByHand(queue, 'a', 7)).toBe(queue)
    expect(markDoneByHand(queue, 'b', 7)).toBe(queue)
    expect(markDoneByHand(queue, 'c', 7)).toBe(queue)
    expect(markDoneByHand(queue, 'missing', 7)).toBe(queue)
  })
})

describe('placeholders - tracker cards without a scenario', () => {
  const note = (id: string, patch: Partial<QueueItem> = {}) =>
    item(id, { scenarioId: '', placeholder: true, ...patch })
  const states = (queue: ScenarioQueue) => queue.items.map((one) => one.state)

  it('passes the placeholders the queue has reached and starts the scenario behind them', () => {
    const passed = passPlaceholders(queueOf(note('p1'), note('p2'), item('a'), note('p3')), NOW)

    expect(states(passed)).toEqual(['skipped', 'skipped', 'waiting', 'waiting'])
    expect(nextToStart(passed, NOW)?.id).toBe('a')
  })

  it('does not pass a placeholder while a run goes, the queue holds or a run failed', () => {
    const running = queueOf(item('a', { state: 'running', runId: 'r' }), note('p'))
    const held = { ...queueOf(item('a', { state: 'done' }), note('p')), hold: null }
    const stopped = {
      ...held,
      hold: { reason: 'stopAfter' as const, itemId: 'a', at: NOW },
    }
    const failed = queueOf(item('a', { state: 'failed' }), note('p'))

    expect(passPlaceholders(running, NOW)).toBe(running)
    expect(passPlaceholders(stopped, NOW)).toBe(stopped)
    expect(passPlaceholders(failed, NOW)).toBe(failed)
    expect(states(passPlaceholders(held, NOW))).toEqual(['done', 'skipped'])
  })

  it('a skipped placeholder decides nothing: the scenario before it does', () => {
    const afterSuccess = queueOf(item('a', { state: 'done' }), note('p', { state: 'skipped' }))
    const afterStop = queueOf(item('a', { state: 'stopped' }), note('p', { state: 'skipped' }))

    expect(nextToStart(addItem(afterSuccess, item('b')), NOW)?.id).toBe('b')
    expect(holdBeforeFailure(addItem(afterSuccess, item('b')), NOW).hold).toBeNull()
    expect(reopenItem(afterStop, 'a')?.items[0]?.state).toBe('running')
  })

  it('takes no stop mark and names the queue by a scenario, not by a placeholder', () => {
    const queue = queueOf(note('p'), item('a'))

    expect(setStopAfter(queue, 'p').stopAfterItemId).toBe('')
    expect(renameQueue(queue, '', 'user').name).toBe('Scenario a')
  })
})

describe('closing a queue left idle', () => {
  const quiet = (queue: ScenarioQueue): ScenarioQueue => ({ ...queue, activeAt: 1_000 })
  const later = 1_000 + QUEUE_IDLE_CLOSE_MS

  it('closes an open queue two weeks after anything happened in it, not a moment before', () => {
    const queue = quiet(queueOf(item('a', { state: 'done' })))

    expect(isIdleTooLong(queue, later - 1)).toBe(false)
    expect(isIdleTooLong(queue, later)).toBe(true)
  })

  it('closes a forgotten queue with work still waiting behind a hold', () => {
    const held = {
      ...quiet(queueOf(item('a', { state: 'failed' }), item('b'))),
      hold: { reason: 'failed' as const, itemId: 'a', at: 1_000 },
    }

    expect(isIdleTooLong(held, later)).toBe(true)
  })

  it('keeps a queue with a run in it however long the run stands, and leaves a closed one be', () => {
    const running = quiet(queueOf(item('a', { state: 'running', runId: 'r' })))
    const closed = { ...quiet(queueOf(item('a', { state: 'done' }))), closedAt: 2_000 }

    expect(isIdleTooLong(running, later * 2)).toBe(false)
    expect(isIdleTooLong(closed, later * 2)).toBe(false)
  })
})

describe('what queue items run on', () => {
  const opus = [{ model: 'opus', effort: 'high' }]
  const sonnet = [{ model: 'sonnet', effort: 'low' }]

  it('keeps the snapshot a run started with, whatever the shelf says later', () => {
    const started = markStarted(queueOf(item('a', { runsOn: opus }), item('b')), 'a', 'r', sonnet)
    const fresh = withRunsOn(started, [
      { itemId: 'a', runsOn: opus, from: 'shelf' },
      { itemId: 'b', runsOn: opus, from: 'shelf' },
    ])

    expect(fresh.items.map((one) => one.runsOn)).toEqual([sonnet, opus])
  })

  it('fills an older started item from its run once, and changes nothing that is already so', () => {
    const queue = queueOf(item('a', { state: 'done', runId: 'r' }), item('b', { runsOn: opus }))
    const filled = withRunsOn(queue, [{ itemId: 'a', runsOn: opus, from: 'run' }])

    expect(filled.items[0]?.runsOn).toEqual(opus)
    expect(withRunsOn(filled, [{ itemId: 'a', runsOn: sonnet, from: 'run' }])).toBe(filled)
    expect(withRunsOn(filled, [{ itemId: 'b', runsOn: opus, from: 'shelf' }])).toBe(filled)
  })
})
