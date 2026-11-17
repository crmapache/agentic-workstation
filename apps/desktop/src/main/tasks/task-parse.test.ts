import { it, expect, describe } from 'vitest'

import type { Task, TaskDraft } from '@shared/tasks'
import { MINUTE_MS } from '@shared/time-units'

import { draftToTask } from './task-parse'

const now = new Date(2026, 11, 1, 9, 0, 10).getTime()

const task = (patch: Partial<Task> = {}): Task => ({
  id: 't1',
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
})
