import { it, expect, describe } from 'vitest'

import type { TaskRun } from '@shared/tasks'
import { DAY_MS } from '@shared/time-units'

import { blankItem, finishItem } from './inbox-items'
import {
  itemOf,
  closeItem,
  DONE_KEPT,
  pruneItems,
  settleStale,
  OPEN_READ_KEPT,
} from './inbox-rules'

const now = Date.now()

const run = (patch: Partial<TaskRun>): TaskRun => ({
  id: 'r1',
  taskId: 't1',
  taskName: 'Invoice',
  provider: 'claude',
  projectPath: '/p',
  sessionId: 's1',
  trigger: 'schedule',
  state: 'done',
  dueAt: 0,
  startedAt: now,
  endedAt: now,
  updatedAt: now,
  report: 'Ready.',
  failure: null,
  skip: null,
  detail: '',
  costUsd: 0,
  asking: 0,
  notified: false,
  ...patch,
})

describe('itemOf', () => {
  it('reads back what it wrote and drops unknown kinds', () => {
    const item = blankItem({ kind: 'reminder', title: 'Call Corey', deliverAt: now + DAY_MS })

    expect(itemOf(JSON.parse(JSON.stringify(item)))).toEqual(item)
    expect(itemOf({ ...item, kind: 'spam' })).toBeNull()
  })
})

describe('settleStale', () => {
  it('closes a question left from the previous IDE run', () => {
    const asking = blankItem({ kind: 'permission', title: 'Invoice', requestId: 'req' })

    expect(settleStale(asking, now)).toMatchObject({ doneAt: now, outcome: 'withdrawn' })
    expect(settleStale(blankItem({ kind: 'message', title: 'Hi' }), now).doneAt).toBe(0)
  })
})

describe('pruneItems', () => {
  it('keeps every open item and at most DONE_KEPT recent closed ones', () => {
    const open = blankItem({ kind: 'message', title: 'open' })
    const closed = Array.from({ length: DONE_KEPT + 5 }, (_, index) =>
      closeItem(blankItem({ kind: 'message', title: `${index}` }), 'dismissed', now),
    )
    const old = closeItem(
      blankItem({ kind: 'message', title: 'old' }),
      'dismissed',
      now - 40 * DAY_MS,
    )
    const kept = pruneItems([...closed, old, open], now)

    expect(kept).toContain(open)
    expect(kept).not.toContain(old)
    expect(kept.filter((item) => item.doneAt !== 0)).toHaveLength(DONE_KEPT)
  })
})

describe('pruneItems for open items', () => {
  it('keeps questions and unread, and at most OPEN_READ_KEPT read reports', () => {
    const read = Array.from({ length: OPEN_READ_KEPT + 20 }, (_, index) =>
      blankItem({ kind: 'report', title: `${index}`, readAt: now, arrivedAt: now }),
    )
    const asking = blankItem({ kind: 'question', title: 'q', readAt: now, requestId: 'r' })
    const unread = blankItem({ kind: 'message', title: 'new' })
    const kept = pruneItems([...read, asking, unread], now)

    expect(kept).toContain(asking)
    expect(kept).toContain(unread)
    expect(kept.filter((item) => item.kind === 'report')).toHaveLength(OPEN_READ_KEPT)
  })
})

describe('finishItem', () => {
  it('reports a finished run unless it already notified or reports are off', () => {
    expect(finishItem(run({}), undefined)?.kind).toBe('report')
    expect(finishItem(run({ notified: true }), undefined)).toBeNull()
    expect(
      finishItem(run({}), {
        report: false,
      } as Parameters<typeof finishItem>[1]),
    ).toBeNull()
    expect(finishItem(run({ state: 'stopped' }), undefined)).toBeNull()
  })

  it('offers what fixes the failure', () => {
    const kinds = (patch: Partial<TaskRun>) =>
      finishItem(run({ state: 'failed', ...patch }), undefined)?.actions.map((one) => one.kind)

    expect(kinds({ failure: 'untrusted' })).toEqual(['trust', 'showRun'])
    expect(kinds({ failure: 'crashed' })).toEqual(['resume', 'runAgain', 'showRun'])
    expect(kinds({ failure: 'noClaude' })).toEqual(['runAgain', 'showRun'])
    expect(
      finishItem(run({ state: 'stopped', failure: 'ideClosed' }), undefined)?.actions[0]?.kind,
    ).toBe('resume')
  })
})
