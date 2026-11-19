import { it, expect, describe } from 'vitest'

import type { Conversation } from '@shared/conversation'
import { isRunWorking } from '@shared/scenario-runs'
import type { RunState } from '@shared/scenario-runs'

import { taskWork, projectWork } from './project-work.utils'

const chat = (id: string, projectPath: string, change: Partial<Conversation> = {}) => ({
  id,
  projectPath,
  status: 'idle' as Conversation['status'],
  outcome: 'none' as Conversation['outcome'],
  pending: null,
  turnStartedAt: null,
  backgroundWork: false,
  ...change,
})

const run = (id: string, projectPath: string, state: RunState, asking = '') => ({
  id,
  projectPath,
  state,
  asking,
})

const TEXT = {
  chat: (conversation: { id: string }) => `chat ${conversation.id}`,
  run: (item: { id: string }) => `run ${item.id}`,
}

describe('прогон сценария работает сам', () => {
  it('начинается или идёт - да; спрашивает, на паузе, упёрся, кончился - нет', () => {
    expect(isRunWorking(run('a', '/p', 'starting'))).toBe(true)
    expect(isRunWorking(run('a', '/p', 'running'))).toBe(true)
    expect(isRunWorking(run('a', '/p', 'running', 'Which branch?'))).toBe(false)
    expect(isRunWorking(run('a', '/p', 'paused'))).toBe(false)
    expect(isRunWorking(run('a', '/p', 'blocked'))).toBe(false)
    expect(isRunWorking(run('a', '/p', 'done'))).toBe(false)
  })
})

describe('что работает в проекте', () => {
  it('свои работающие разговоры и прогоны: разговоры первыми, чужой проект не в счёт', () => {
    const conversations = [
      chat('a', '/p', { status: 'running', turnStartedAt: 1 }),
      chat('b', '/p'),
      chat('c', '/other', { status: 'running', turnStartedAt: 1 }),
      chat('d', '/p', { outcome: 'done', backgroundWork: true }),
    ]
    const runs = [run('r1', '/p', 'running'), run('r2', '/other', 'running')]

    expect(projectWork(conversations, runs, '/p', TEXT)).toEqual([
      { id: 'a', text: 'chat a', background: false },
      { id: 'd', text: 'chat d', background: false },
      { id: 'r1', text: 'run r1', background: true },
    ])
  })

  it('разговор, который ждёт человека, - не работа: о нём говорит точка зова', () => {
    const waiting = chat('a', '/p', { status: 'waiting', turnStartedAt: 1 })

    expect(projectWork([waiting], [], '/p', TEXT)).toEqual([])
  })
})

describe('taskWork', () => {
  it('counts a running task run of the project, not one waiting for an answer', () => {
    const runs = [
      { id: 't1', projectPath: '/a', state: 'running' as const },
      { id: 't2', projectPath: '/a', state: 'waiting' as const },
      { id: 't3', projectPath: '/b', state: 'running' as const },
      { id: 't4', projectPath: '/a', state: 'done' as const },
    ]

    expect(taskWork(runs, '/a', (one) => `task ${one.id}`)).toEqual([
      { id: 't1', text: 'task t1', background: true },
    ])
  })
})
