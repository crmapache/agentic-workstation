import { it, expect, describe } from 'vitest'

import type { ClosedTab } from '../agents/panel/closed-tabs'
import { closedView } from '../agents/panel/closed-tabs'
import { toStored, freshConversation } from '../agents/panel/panel-state'
import { parseStoredClaude } from './claude-state'

/** Закрытая вкладка, как её пишет полоса вкладок (agents/panel/closed-tabs.ts). */
const closed = (id: string, closedAt = 0): ClosedTab => ({
  stored: {
    id,
    projectPath: '/p',
    sessionId: `s-${id}`,
    title: id,
    titleSource: 'llm',
    outcome: 'done',
    model: null,
    effort: null,
    permissionMode: 'default',
    queue: [],
    fork: null,
    updatedAt: 0,
  },
  place: { groupsLeft: [], tabsLeft: [] },
  closedAt,
  hasDraft: false,
})

describe('сохранённые разговоры', () => {
  it('очередь переживает перезапуск текстом, битые записи в ней отбрасываются', () => {
    const conversation = freshConversation({
      id: 'c1',
      projectPath: '/p',
      sessionId: 's1',
      title: 'Fix',
      model: null,
      effort: 'high',
      permissionMode: 'plan',
      queue: [
        {
          id: 'q1',
          text: 'not sent yet',
          imageCount: 2,
          draft: { tokens: [{ kind: 'text', value: 'not sent yet' }], quotes: [] },
        },
      ],
      fork: { sourceSessionId: 's0', sourceTitle: 'Origin', at: 'a1' },
      updatedAt: 5,
    })
    const stored = JSON.parse(
      JSON.stringify({
        conversations: [toStored(conversation)],
        activeByProject: { '/p': 'c1' },
        trustedProjects: ['/p', 'relative'],
      }),
    ) as { conversations: { queue: unknown[] }[] }

    stored.conversations[0]?.queue.push({ id: 'q2' }, 'junk')

    const parsed = parseStoredClaude(stored)

    expect(parsed.conversations[0]).toMatchObject({
      effort: 'high',
      permissionMode: 'plan',
      queue: [
        {
          id: 'q1',
          text: 'not sent yet',
          imageCount: 0,
          draft: { tokens: [{ kind: 'text', value: 'not sent yet' }], quotes: [] },
        },
      ],
      fork: { sourceSessionId: 's0', sourceTitle: 'Origin', at: 'a1' },
    })
    expect(parsed.trustedProjects).toEqual(['/p'])
  })

  it('форк, который несёт разговор целиком вместо разреза, помнит это после перезапуска', () => {
    const fork = { sourceSessionId: 's0', sourceTitle: 'Origin', at: 'a1' }
    const parsed = parseStoredClaude({
      conversations: [
        { id: 'c1', projectPath: '/p', sessionId: 's1', fork: { ...fork, whole: true } },
        { id: 'c2', projectPath: '/p', sessionId: 's2', fork: { ...fork, whole: 'yes' } },
      ],
    })

    expect(parsed.conversations[0]?.fork).toEqual({ ...fork, whole: true })
    expect(parsed.conversations[1]?.fork).toEqual(fork)
  })

  it('контекст вкладки переживает перезапуск, а без окна или битый не пишется', () => {
    const conversation = freshConversation({
      id: 'c1',
      projectPath: '/p',
      sessionId: 's1',
      title: 'Fix',
      model: null,
      effort: null,
      permissionMode: 'default',
      queue: [],
      fork: null,
      updatedAt: 0,
    })
    const known = {
      ...conversation,
      usage: { contextTokens: 52_000, contextWindow: 200_000 },
    }
    const unknown = {
      ...conversation,
      usage: { contextTokens: 9_000, contextWindow: 0 },
    }
    const parsed = parseStoredClaude(
      JSON.parse(
        JSON.stringify({
          conversations: [
            toStored(known),
            toStored({ ...unknown, id: 'c2' }),
            { ...toStored({ ...conversation, id: 'c3' }), context: { tokens: 'x', window: -1 } },
          ],
        }),
      ),
    )
    const restored = parsed.conversations.map((stored) => freshConversation(stored).usage)

    expect(restored).toEqual([
      { contextTokens: 52_000, contextWindow: 200_000 },
      { contextTokens: 0, contextWindow: 0 },
      { contextTokens: 0, contextWindow: 0 },
    ])
  })

  it('выбранной остаётся только вкладка разговора: снятые вкладки панели после перезапуска пропадают', () => {
    const parsed = parseStoredClaude({
      conversations: [{ id: 'c1', projectPath: '/p', sessionId: 's1' }],
      activeByProject: { '/p': 'c1', '/q': 'panel:scenarios', '/r': 'panel:statistics' },
      panelTabs: [{ kind: 'scenarios', projectPath: '/q', unitsLeft: [] }],
    })

    expect(parsed.activeByProject).toEqual({ '/p': 'c1' })
    expect(parsed).not.toHaveProperty('panelTabs')
  })
})

describe('команды проекта', () => {
  it('имена переживают перезапуск; чужая папка и битые имена отбрасываются', () => {
    const parsed = parseStoredClaude({
      commandsByProject: {
        '/p': ['compact', 'mcp__srv__prompt', 7, ''],
        relative: ['compact'],
        '/q': 'compact',
      },
    })

    expect(parsed.commandsByProject).toEqual({ '/p': ['compact', 'mcp__srv__prompt'] })
    expect(parseStoredClaude({}).commandsByProject).toEqual({})
  })
})

describe('закрытые вкладки на диске', () => {
  it('переживают перезапуск: место и черновик с диска, битое выпадает', () => {
    const file = JSON.parse(
      JSON.stringify({
        conversations: [],
        closed: [
          { ...closed('a', 7), place: { groupsLeft: ['g'], tabsLeft: ['x', 3] }, hasDraft: true },
          { stored: { id: 'broken' } },
        ],
      }),
    ) as unknown

    const [tab] = parseStoredClaude(file).closed

    expect(parseStoredClaude(file).closed).toHaveLength(1)
    expect(tab).toMatchObject({ closedAt: 7, hasDraft: true, place: { tabsLeft: ['x'] } })
    expect(tab && closedView(tab)).toMatchObject({ id: 'a', title: 'a', titleSource: 'llm' })
  })
})
