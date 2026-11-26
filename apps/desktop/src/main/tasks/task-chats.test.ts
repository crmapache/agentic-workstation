import { it, expect, describe } from 'vitest'

import type { AgentPanelState } from '@shared/conversation'

import type { ScenarioProvider } from '../providers/scenario-provider'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { PanelRegistry } from '../agents/panel/panel-registry'
import { taskChats } from './task-chats'

/** Панель с одной вкладкой разговора: что ей отправили и что открыли из истории. */
const panelWith = (conversation: { id: string; sessionId: string; title: string }) => {
  const sent: [string, string][] = []
  const opened: string[] = []
  const panel = {
    getState: () => ({ conversations: [conversation] }) as unknown as AgentPanelState,
    actions: {
      send: (id: string, message: { text: string }) => {
        sent.push([id, message.text])

        return Promise.resolve()
      },
    },
    openHistory: (_path: string, sessionId: string) => {
      opened.push(sessionId)

      return Promise.resolve({} as AgentPanelState)
    },
  }

  return { panel, sent, opened }
}

describe('разговоры заданий и уведомлений у любого провайдера', () => {
  it('уведомление из вкладки Codex - его источник; кнопка отвечает в ту же вкладку', async () => {
    const claude = panelWith({ id: 'c1', sessionId: 's-claude', title: 'Claude chat' })
    const codex = panelWith({ id: 'x1', sessionId: 'thread-1', title: 'Codex chat' })
    const panels = {
      find: (provider: string) =>
        provider === 'claude' ? claude.panel : provider === 'codex' ? codex.panel : undefined,
    } as unknown as PanelRegistry
    const chats = taskChats({
      panels,
      provider: () => null,
      workspace: {} as WorkspaceService,
      runBySession: () => null,
    })

    const { origin, source } = chats.originOf({ projectPath: '/p', conversationId: 'x1' })

    expect(origin).toEqual({
      kind: 'chat',
      provider: 'codex',
      conversationId: 'x1',
      sessionId: 'thread-1',
    })
    expect(source).toBe('Codex chat')

    if (origin.kind !== 'chat') throw new Error('не разговор')

    await expect(chats.sendToOrigin(origin, '/p', 'Yes')).resolves.toBe(true)
    expect(codex.sent).toEqual([['x1', 'Yes']])
    expect(claude.sent).toEqual([])
  })

  it('прогон, открытый чатом, - слова во вкладку провайдера по его id разговора', async () => {
    const codex = panelWith({ id: 'x1', sessionId: 'thread-1', title: '' })
    const panels = { find: () => codex.panel } as unknown as PanelRegistry
    const chats = taskChats({
      panels,
      provider: () =>
        ({ chatIdOf: () => Promise.resolve('thread-1') }) as unknown as ScenarioProvider,
      workspace: {} as WorkspaceService,
      runBySession: () => null,
    })

    await expect(
      chats.sendToRunChat({ sessionId: 'engine-uuid', provider: 'codex' }, 'go on'),
    ).resolves.toBe(true)
    expect(codex.sent).toEqual([['x1', 'go on']])
  })
})
