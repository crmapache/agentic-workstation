import { it, expect, describe } from 'vitest'

import { DEFAULT_GOAL } from '@shared/goals'
import type { Task, TaskDraft } from '@shared/tasks'
import { MINUTE_MS } from '@shared/time-units'

import { goalOf, draftToTask } from './task-parse'

const now = new Date(2026, 11, 1, 9, 0, 10).getTime()

const task = (patch: Partial<Task> = {}): Task => ({
  id: 't1',
  kind: 'schedule',
  name: 'Invoice',
  projectPath: '/p',
  prompt: 'Do it',
  schedule: { repeat: 'monthly', at: 9 * 60, days: [], monthDay: 1, date: '' },
  enabled: true,
  catchUp: true,
  report: true,
  provider: 'claude',
  model: '',
  effort: '',
  permissionMode: 'auto',
  goal: DEFAULT_GOAL,
  createdAt: 1,
  updatedAt: 1,
  nextAt: new Date(2026, 11, 1, 9, 0).getTime(),
  ...patch,
})

const draftOf = ({ createdAt: _c, updatedAt: _u, nextAt: _n, ...rest }: Task): TaskDraft => rest

const known = () => true

describe('draftToTask', () => {
  it('keeps a due time that has come when the rhythm did not change', () => {
    const previous = task()
    const saved = draftToTask(
      { ...draftOf(previous), name: 'Invoice ReClick' },
      previous,
      known,
      now,
    )

    expect(saved).toMatchObject({ name: 'Invoice ReClick', nextAt: previous.nextAt })
  })

  it('moves the due time when the rhythm changed', () => {
    const previous = task()
    const saved = draftToTask(
      { ...draftOf(previous), schedule: { ...previous.schedule, monthDay: 2 } },
      previous,
      known,
      now,
    )

    expect(saved).toMatchObject({ nextAt: new Date(2026, 11, 2, 9, 0).getTime() })
  })

  it('lets a past one-off task be renamed, but not set into the past', () => {
    const once = { repeat: 'once' as const, at: 9 * 60, days: [], monthDay: 1, date: '2026-11-20' }
    const previous = task({ schedule: once, nextAt: 0 })

    expect(draftToTask({ ...draftOf(previous), name: 'Old' }, previous, known, now)).toMatchObject({
      name: 'Old',
      nextAt: 0,
    })
    expect(draftToTask({ ...draftOf(task()), id: null, schedule: once }, null, known, now)).toBe(
      'badSchedule',
    )
  })

  it('checks the folder of a new task but keeps the folder of an old one', () => {
    const previous = task()

    expect(draftToTask({ ...draftOf(previous), id: null }, null, () => false, now)).toBe(
      'badFolder',
    )
    expect(typeof draftToTask(draftOf(previous), previous, () => false, now + MINUTE_MS)).toBe(
      'object',
    )
  })

  it('keeps the project of an edited task: a task belongs to its project', () => {
    const previous = task()
    const saved = draftToTask({ ...draftOf(previous), projectPath: '/other' }, previous, known, now)

    expect(saved).toMatchObject({ projectPath: '/p' })
  })

  it('gives a goal no due time: it lives until it is done', () => {
    const saved = draftToTask({ ...draftOf(task({ kind: 'goal' })), id: null }, null, known, now)

    expect(saved).toMatchObject({ kind: 'goal', nextAt: 0 })
  })
})

describe('goalOf', () => {
  it('falls back to the defaults and clamps limits', () => {
    expect(goalOf(null)).toEqual(DEFAULT_GOAL)
    expect(goalOf({ outbound: 'spam', budgetUsd: -3, lifeDays: 900 })).toEqual({
      outbound: 'confirm',
      budgetUsd: 0.01,
      lifeDays: 365,
    })
    expect(goalOf({ outbound: 'free', budgetUsd: 12.345, lifeDays: 3 })).toEqual({
      outbound: 'free',
      budgetUsd: 12.35,
      lifeDays: 3,
    })
  })
})
