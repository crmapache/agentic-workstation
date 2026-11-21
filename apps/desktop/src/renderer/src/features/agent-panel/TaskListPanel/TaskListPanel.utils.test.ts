import { it, expect, describe } from 'vitest'

import type { TaskEntry } from '@shared/conversation-feed'

import { taskText } from './TaskListPanel.utils'

const task = (over: Partial<TaskEntry> = {}): TaskEntry => ({
  id: '1',
  subject: 'Run the final check',
  activeForm: 'Running the final check',
  state: 'in_progress',
  ...over,
})

describe('taskText', () => {
  it('«что делаю сейчас» - только пока работа идёт, иначе сама задача', () => {
    expect(taskText(task(), true)).toBe('Running the final check')
    expect(taskText(task(), false)).toBe('Run the final check')
    expect(taskText(task({ state: 'pending' }), true)).toBe('Run the final check')
    expect(taskText(task({ activeForm: '' }), true)).toBe('Run the final check')
  })
})
