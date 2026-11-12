import { it, expect, describe } from 'vitest'

import type { TabCall } from '../../features/claude-code/claude.types'
import { projectCalls } from './project-calls.utils'

const conversations = [
  { id: 'a', projectPath: '/p' },
  { id: 'b', projectPath: '/p' },
  { id: 'c', projectPath: '/other' },
  { id: 'd', projectPath: '/p' },
]

const calls: Record<string, TabCall> = {
  a: { reason: 'turnDone', tone: 'success', at: 30 },
  b: { reason: 'permission', tone: 'attention', at: 10 },
  c: { reason: 'error', tone: 'danger', at: 20 },
  gone: { reason: 'turnDone', tone: 'success', at: 5 },
}

describe('позвавшие разговоры проекта', () => {
  it('только свои и открытые, от старого зова к новому, со словами', () => {
    expect(projectCalls(conversations, calls, '/p', (id, call) => `${id}:${call.reason}`)).toEqual([
      { id: 'b', tone: 'attention', at: 10, text: 'b:permission' },
      { id: 'a', tone: 'success', at: 30, text: 'a:turnDone' },
    ])
  })

  it('никто не звал - пусто', () => {
    expect(projectCalls(conversations, {}, '/p', () => '')).toEqual([])
  })
})
