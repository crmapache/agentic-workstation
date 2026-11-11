import { it, expect, describe } from 'vitest'

import type { InventoryProject } from '@agentic-workstation/remote-protocol/wire-types'

import { initialsOf, avatarToneOf, projectNeedsYou, conversationCounts } from './projects.utils'

const project = (over: Partial<InventoryProject> = {}): InventoryProject => ({
  key: 'p-x',
  name: 'secret-client',
  open: true,
  conversations: [
    { id: 'a', provider: 'claude', title: 'A', status: 'running', since: 0, waiting: null },
    { id: 'b', provider: 'claude', title: 'B', status: 'idle', since: 0, waiting: null },
  ],
  queues: { open: 1, running: 0, asking: 0 },
  ...over,
})

describe('проекты на телефоне', () => {
  it('значок: буквы двух слов, цвет постоянный для имени', () => {
    expect(initialsOf('secret-client')).toBe('SC')
    expect(initialsOf('relay')).toBe('RE')
    expect(avatarToneOf('secret-client')).toBe(avatarToneOf('secret-client'))
  })

  it('счёт разговоров по состояниям', () => {
    expect(conversationCounts(project())).toEqual({ running: 1, idle: 1, 'waiting-for-you': 0 })
  })

  it('ждёт человека: разговор с вопросом или прогон с вопросом', () => {
    expect(projectNeedsYou(project())).toBe(false)
    expect(projectNeedsYou(project({ queues: { open: 1, running: 1, asking: 1 } }))).toBe(true)
  })
})
