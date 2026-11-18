import { it, expect, describe } from 'vitest'

import type { TabCall } from '../../features/claude-code/claude.types'
import type { CallingRun } from './project-calls.utils'
import { taskCalls, projectCalls } from './project-calls.utils'

const conversations = [
  { id: 'a', projectPath: '/p' },
  { id: 'b', projectPath: '/p' },
  { id: 'c', projectPath: '/other' },
  { id: 'd', projectPath: '/p' },
]

const calls: Record<string, TabCall> = {
  a: { reason: 'turnDone', tone: 'success', at: 30, provider: 'claude' },
  b: { reason: 'permission', tone: 'attention', at: 10, provider: 'claude' },
  c: { reason: 'error', tone: 'danger', at: 20, provider: 'claude' },
  gone: { reason: 'turnDone', tone: 'success', at: 5, provider: 'claude' },
}

const run = (id: string, patch: Partial<CallingRun> = {}): CallingRun => ({
  id,
  projectPath: '/p',
  state: 'running',
  asking: '',
  startedAt: 1,
  restingSince: 0,
  scenarioName: `Scenario ${id}`,
  ...patch,
})

const text = {
  chat: (id: string, call: TabCall) => `${id}:${call.reason}`,
  run: (one: CallingRun) => one.scenarioName,
}

describe('зов проекта', () => {
  it('только свои и открытые разговоры, от старого зова к новому, со словами', () => {
    expect(projectCalls(conversations, calls, [], '/p', text)).toEqual([
      { id: 'b', tone: 'attention', at: 10, text: 'b:permission' },
      { id: 'a', tone: 'success', at: 30, text: 'a:turnDone' },
    ])
  })

  it('прогон своего проекта с вопросом зовёт с момента, как встал на нём', () => {
    const runs = [
      run('r1', { asking: 'Allow Bash?', restingSince: 20 }),
      run('r2', { state: 'blocked', startedAt: 40 }),
      run('r3'),
      run('r4', { asking: 'Deploy?', projectPath: '/other' }),
    ]

    expect(projectCalls(conversations, calls, runs, '/p', text)).toEqual([
      { id: 'b', tone: 'attention', at: 10, text: 'b:permission' },
      { id: 'r1', tone: 'attention', at: 20, text: 'Scenario r1' },
      { id: 'a', tone: 'success', at: 30, text: 'a:turnDone' },
      { id: 'r2', tone: 'attention', at: 40, text: 'Scenario r2' },
    ])
  })

  it('никто не звал - пусто', () => {
    expect(projectCalls(conversations, {}, [run('r')], '/p', text)).toEqual([])
  })

  it('прогон задания зовёт, пока ждёт человека, - только свой проект', () => {
    const runs = [
      { id: 't1', projectPath: '/p', state: 'waiting' as const, updatedAt: 7, taskName: 'Corey' },
      { id: 't2', projectPath: '/p', state: 'sleeping' as const, updatedAt: 8, taskName: 'Nap' },
      { id: 't3', projectPath: '/x', state: 'waiting' as const, updatedAt: 9, taskName: 'Other' },
    ]

    expect(taskCalls(runs, '/p', (one) => one.taskName)).toEqual([
      { id: 't1', tone: 'attention', at: 7, text: 'Corey' },
    ])
  })
})
