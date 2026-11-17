import { it, expect, describe } from 'vitest'

import type { TaskRun } from '@shared/tasks'

import { keepRuns, RUNS_PER_TASK, SKIPS_PER_TASK } from './task-book'

const run = (index: number, patch: Partial<TaskRun> = {}): TaskRun => ({
  id: `r${index}`,
  taskId: 't',
  taskName: 'T',
  projectPath: '/p',
  sessionId: `s${index}`,
  trigger: 'schedule',
  state: 'done',
  dueAt: 0,
  startedAt: index,
  endedAt: index,
  updatedAt: index,
  report: '',
  failure: null,
  skip: null,
  detail: '',
  costUsd: 0,
  asking: 0,
  notified: false,
  ...patch,
})

describe('keepRuns', () => {
  it('never drops a run that still waits, however many skips came after it', () => {
    const waiting = run(0, { state: 'waiting' })
    const skips = Array.from({ length: 40 }, (_, index) =>
      run(index + 1, { state: 'skipped', skip: 'busy', sessionId: '' }),
    )
    const kept = keepRuns([waiting, ...skips])

    expect(kept).toContain(waiting)
    expect(kept.filter((one) => one.state === 'skipped')).toHaveLength(SKIPS_PER_TASK)
  })

  it('keeps real runs apart from skips', () => {
    const real = Array.from({ length: RUNS_PER_TASK + 5 }, (_, index) => run(index))
    const skips = Array.from({ length: 20 }, (_, index) =>
      run(100 + index, { state: 'skipped', skip: 'busy' }),
    )
    const kept = keepRuns([...real, ...skips])

    expect(kept.filter((one) => one.state === 'done')).toHaveLength(RUNS_PER_TASK)
    expect(kept[0]?.id).toBe('r119')
  })
})
