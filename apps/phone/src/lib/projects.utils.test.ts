import { it, expect, describe } from 'vitest'

import type { InventoryProject } from '@agentic-workstation/remote-protocol/wire-types'

import {
  initialsOf,
  avatarToneOf,
  projectWorks,
  projectNeedsYou,
  conversationCounts,
  startedConversations,
  projectWorksInBackground,
} from './projects.utils'

const project = (over: Partial<InventoryProject> = {}): InventoryProject => ({
  key: 'p-x',
  name: 'secret-client',
  open: true,
  conversations: [
    {
      id: 'a',
      provider: 'claude',
      title: 'A',
      status: 'running',
      outcome: 'done',
      since: 0,
      waiting: null,
    },
    {
      id: 'b',
      provider: 'claude',
      title: 'B',
      status: 'idle',
      outcome: 'done',
      since: 0,
      waiting: null,
    },
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

  it('пустые вкладки «New chat» телефон не видит и не считает', () => {
    const [first, second] = project().conversations
    const blank = { ...second!, id: 'c', title: 'New chat', blank: true }
    const withBlank = project({ conversations: [first!, second!, blank] })

    expect(startedConversations(withBlank).map((one) => one.id)).toEqual(['a', 'b'])
    expect(conversationCounts(withBlank)).toEqual({ running: 1, idle: 1, 'waiting-for-you': 0 })
  })

  it('ждёт человека: разговор с вопросом или прогон с вопросом', () => {
    expect(projectNeedsYou(project())).toBe(false)
    expect(projectNeedsYou(project({ queues: { open: 1, running: 1, asking: 1 } }))).toBe(true)
  })

  it('работа - идущий ход или прогон, который ни о чём не спрашивает', () => {
    const idle = project().conversations.map((one) => ({ ...one, status: 'idle' as const }))

    expect(projectWorks(project())).toBe(true)
    expect(projectWorks(project({ conversations: idle }))).toBe(false)
    expect(
      projectWorks(project({ conversations: idle, queues: { open: 1, running: 1, asking: 0 } })),
    ).toBe(true)
    expect(
      projectWorks(project({ conversations: idle, queues: { open: 1, running: 1, asking: 1 } })),
    ).toBe(false)
  })

  it('IDE шлёт, сколько прогонов работает само: пауза и упор в лимит - не работа', () => {
    const idle = project().conversations.map((one) => ({ ...one, status: 'idle' as const }))
    const paused = { open: 1, running: 1, asking: 0, working: 0 }

    expect(projectWorks(project({ conversations: idle, queues: paused }))).toBe(false)
    expect(
      projectWorks(project({ conversations: idle, queues: { ...paused, running: 2, working: 1 } })),
    ).toBe(true)
  })

  it('знак приглушён, когда идут одни сценарии, а ход разговора не идёт', () => {
    const idle = project().conversations.map((one) => ({ ...one, status: 'idle' as const }))
    const runs = { open: 1, running: 1, asking: 0, working: 1 }

    expect(projectWorksInBackground(project({ conversations: idle, queues: runs }))).toBe(true)
    expect(projectWorksInBackground(project({ queues: runs }))).toBe(false)
    expect(projectWorksInBackground(project())).toBe(false)
  })

  it('идущий прогон задания - тоже работа, фоновая; IDE старше заданий не шлёт', () => {
    const idle = project().conversations.map((one) => ({ ...one, status: 'idle' as const }))
    const quiet = { open: 0, running: 0, asking: 0, working: 0 }
    const task = project({ conversations: idle, queues: quiet, tasks: { working: 1 } })

    expect(projectWorks(task)).toBe(true)
    expect(projectWorksInBackground(task)).toBe(true)
    expect(projectWorks(project({ conversations: idle, queues: quiet }))).toBe(false)
  })
})
