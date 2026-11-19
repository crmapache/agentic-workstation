import { it, vi, expect, describe } from 'vitest'

import type { Conversation, AgentPanelState } from '@shared/conversation'
import { CODEX_CAPABILITIES } from '@shared/panel-capabilities'

import type { AgentPanel } from '../agents/panel/agent-panel'
import { panelPort } from './panel-ports'
import { PROJECT_PATH, conversationOf } from './__fixtures__/fake-ide'

/**
 * Порт моста поверх ядра панели (AgentPanel): новая вкладка и прошлый разговор - теми же
 * методами, что у окна, без своего Claude Code. Панель - подделка тех методов, что зовёт порт.
 */
const panelOf = () => {
  const state = {
    conversations: [conversationOf({ id: 'old-tab' })],
    activeByProject: { [PROJECT_PATH]: 'old-tab' },
    models: [],
    cli: 'found',
    capabilities: CODEX_CAPABILITIES,
  } as unknown as AgentPanelState
  const setOptions = vi.fn()
  const opened = vi.fn()
  const history = [{ sessionId: 'thread-1', title: 'Old work', updatedAt: 1, isOpen: false }]
  const addTab = (tab: Partial<Conversation>) => {
    const conversation = conversationOf(tab)

    state.conversations = [...state.conversations, conversation]
    state.activeByProject = {
      ...state.activeByProject,
      [conversation.projectPath]: conversation.id,
    }
  }
  const panel = {
    getState: () => state,
    // Как AgentPanel.openConversation: вкладка с выбором сразу, ответ - её id.
    openConversation: (projectPath: string, options: object) => {
      addTab({ id: 'new-tab', projectPath, sessionId: '' })
      setOptions('new-tab', options)

      return Promise.resolve('new-tab')
    },
    listHistory: () => Promise.resolve(history),
    openHistory: (projectPath: string, sessionId: string) => {
      opened(projectPath, sessionId)
      addTab({ id: 'history-tab', projectPath, sessionId })

      return Promise.resolve(state)
    },
    actions: { setOptions },
  }

  return {
    panel,
    state,
    setOptions,
    opened,
    port: panelPort('codex', panel as unknown as AgentPanel),
  }
}

describe('порт моста поверх панели провайдера', () => {
  it('новый разговор - id созданной вкладки от самой панели, с выбором телефона сразу', async () => {
    const { port, setOptions } = panelOf()
    const options = { model: 'gpt-5.5', permissionMode: 'readOnly' as const }

    expect(await port.newConversation(PROJECT_PATH, options)).toBe('new-tab')
    expect(setOptions).toHaveBeenCalledWith('new-tab', options)
  })

  it('прошлый разговор - вкладкой; журнала нет в истории - null, без openHistory', async () => {
    const { port, opened } = panelOf()

    expect(await port.openHistory(PROJECT_PATH, 'gone')).toBeNull()
    expect(opened).not.toHaveBeenCalled()
    expect(await port.openHistory(PROJECT_PATH, 'thread-1')).toBe('history-tab')
    expect(opened).toHaveBeenCalledWith(PROJECT_PATH, 'thread-1')
  })

  it('провайдер для телефона - по состоянию панели: модели, режимы и уровни Codex', () => {
    const { port } = panelOf()

    expect(port.info()).toMatchObject({
      id: 'codex',
      available: true,
      modes: CODEX_CAPABILITIES.modes,
      efforts: CODEX_CAPABILITIES.efforts,
    })
    // Своего Claude Code у порта панели нет: мост откажет, а не позовёт пустоту.
    expect(port.askAside).toBeUndefined()
    expect(port.bypassDisabled).toBeUndefined()
  })
})
