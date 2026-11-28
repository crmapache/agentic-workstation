import { it, expect, describe } from 'vitest'

import type { TaskEntry, TaskState } from './conversation-feed'
import { tasksByProgress } from './conversation-feed'

const task = (id: string, state: TaskState): TaskEntry => ({
  id,
  subject: `Task ${id}`,
  activeForm: '',
  state,
})

const ids = (tasks: readonly TaskEntry[]) => tasks.map((one) => one.id)

describe('список задач по ходу работы', () => {
  it('модель начала с четвёртой - она сразу за сделанными, а не посреди ждущих', () => {
    const tasks = [
      task('1', 'pending'),
      task('2', 'pending'),
      task('3', 'pending'),
      task('4', 'in_progress'),
      task('5', 'pending'),
    ]

    expect(ids(tasksByProgress(tasks))).toEqual(['4', '1', '2', '3', '5'])
  })

  it('сделанные выше идущей, внутри ступени - порядок модели', () => {
    const tasks = [
      task('1', 'in_progress'),
      task('2', 'completed'),
      task('3', 'pending'),
      task('4', 'completed'),
    ]

    expect(ids(tasksByProgress(tasks))).toEqual(['2', '4', '1', '3'])
  })

  it('список модели не трогает: порядок меняет только показ', () => {
    const tasks = [task('1', 'pending'), task('2', 'completed')]

    tasksByProgress(tasks)

    expect(ids(tasks)).toEqual(['1', '2'])
  })
})
