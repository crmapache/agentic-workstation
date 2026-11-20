import { it, expect, describe } from 'vitest'

import type { TabCall } from '../../features/agent-panel/panel.types'
import { providerCalls } from './provider-calls.utils'

const conversations = [
  { id: 'a', projectPath: '/p' },
  { id: 'b', projectPath: '/p' },
  { id: 'c', projectPath: '/other' },
  { id: 'd', projectPath: '/p' },
]

const line = (id: string, call: TabCall) => `${id}:${call.reason}`

describe('зов панелей провайдеров', () => {
  it('по панели своего провайдера: цвет последнего зова, строки от старого к новому', () => {
    const calls: Record<string, TabCall> = {
      a: { reason: 'turnDone', tone: 'success', at: 30, provider: 'codex' },
      b: { reason: 'permission', tone: 'attention', at: 10, provider: 'codex' },
      d: { reason: 'error', tone: 'danger', at: 20, provider: 'opencode' },
    }

    expect(providerCalls(conversations, calls, '/p', line)).toEqual({
      codex: { tone: 'success', at: 30, lines: ['b:permission', 'a:turnDone'] },
      'open-models': { tone: 'danger', at: 20, lines: ['d:error'] },
    })
  })

  it('чужой проект и закрытый разговор сюда не зовут', () => {
    const calls: Record<string, TabCall> = {
      c: { reason: 'turnDone', tone: 'success', at: 5, provider: 'claude' },
      gone: { reason: 'turnDone', tone: 'success', at: 6, provider: 'kimi' },
    }

    expect(providerCalls(conversations, calls, '/p', line)).toEqual({})
  })
})
