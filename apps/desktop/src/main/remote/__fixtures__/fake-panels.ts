import type { Conversation, AgentPanelState } from '@shared/conversation'
import type { FeedItem, ConversationFeed } from '@shared/conversation-feed'
import { capabilitiesOf } from '@shared/panel-capabilities'
import { worksUnattended } from '@shared/providers'

import type { ConversationsPort } from '../bridge/bridge-ports'
import { PROJECT_PATH, conversationOf } from './fake-ide'
import type { fakeIde } from './fake-ide'

/**
 * Панели Codex, открытых моделей и Antigravity для тестов моста: только ядро AgentPanel (без
 * своего Claude Code), свои разговоры, каталог и лента. Каждый вызов пишется в общий журнал IDE с приставкой
 * провайдера (`codex.send`) - по нему тест видит, какая панель получила команду.
 */

export type CoreProvider = 'codex' | 'opencode' | 'antigravity'

/** id разговоров - UUID вкладок, у панелей разные. */
export const PANEL_CONVERSATION: Record<CoreProvider, string> = {
  codex: '7c0d1e2f-3a4b-4c5d-8e9f-a0b1c2d3e4f5',
  opencode: '8d1e2f3a-4b5c-4d6e-9f0a-b1c2d3e4f5a6',
  antigravity: '9e2f3a4b-5c6d-4e7f-8a0b-c2d3e4f5a6b7',
}

/** Прошлый разговор панели, которого нет вкладкой. */
export const PANEL_PAST: Record<CoreProvider, string> = {
  codex: '019a2b3c-4d5e-4f60-8172-839405162738',
  opencode: 'ses_0a1b2c3d4e5f60718293a4b5c6d7e8f9',
  antigravity: '1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9',
}

const LABELS: Record<CoreProvider, string> = {
  codex: 'Codex',
  opencode: 'Open models',
  antigravity: 'Antigravity',
}

/** Каталог панели: у Codex - уровни у модели и быстрый режим, у открытых - подключение. */
const MODELS: Record<CoreProvider, AgentPanelState['models']> = {
  codex: [
    {
      value: 'gpt-5.5',
      displayName: 'GPT-5.5',
      description: 'Frontier coding',
      fast: true,
      efforts: ['minimal', 'low', 'medium', 'high', 'xhigh'],
      isDefault: true,
    },
  ],
  opencode: [
    {
      value: 'ollama/qwen3',
      displayName: 'Qwen 3',
      description: '',
      efforts: ['low', 'high'],
      group: { id: 'ollama', label: 'Ollama' },
    },
  ],
  antigravity: [{ value: 'gemini-3-pro', displayName: 'Gemini 3 Pro', description: '' }],
}

/** Вызов Codex в ленте - с видом действия и диффом по входу, как его собирает панель. */
export const toolItemOf = (id: string): FeedItem => ({
  kind: 'tool',
  id,
  parentToolUseId: null,
  name: 'apply_patch',
  input: { path: `${PROJECT_PATH}/src/app.ts`, kind: 'update' },
  action: {
    kind: 'edit',
    path: `${PROJECT_PATH}/src/app.ts`,
    preview: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }],
  },
  status: 'done',
  result: { text: '', isError: false, truncated: false, changeCounts: { added: 1, removed: 1 } },
  startedAt: 0,
  endedAt: 0,
  closedReason: null,
})

/**
 * Панель провайдера: состояние руками теста, ответы - как у AgentPanel (новая вкладка встаёт с
 * выбором, прошлый разговор открывается вкладкой). Добавляется в список панелей IDE сразу.
 */
export const addPanel = (ide: ReturnType<typeof fakeIde>, provider: CoreProvider) => {
  const capabilities = capabilitiesOf(provider)
  const id = PANEL_CONVERSATION[provider]
  const own = (over: Partial<Conversation> = {}) =>
    conversationOf({ id, title: `${LABELS[provider]} chat`, model: null, effort: null, ...over })
  const state = {
    conversations: [own()],
    models: MODELS[provider],
    refusedModes: { bypass: false, autoModels: [] },
    capabilities,
    // Лимиты ещё не узнали: телефону - usage null.
    accounts: { current: '', usage: {} },
  } as unknown as AgentPanelState
  const feed: ConversationFeed = {
    conversationId: id,
    items: [toolItemOf(`${provider}-tool`)],
    tasks: [],
    hasEarlier: false,
  }
  const record = (name: string, ...args: unknown[]) => ide.record(`${provider}.${name}`, ...args)
  const history = [
    { sessionId: PANEL_PAST[provider], title: 'Old work', updatedAt: 400, isOpen: false },
  ]
  const port: ConversationsPort = {
    provider,
    info: () => ({
      id: provider,
      label: LABELS[provider],
      available: true,
      unavailable: null,
      models: state.models.map((model) => ({ ...model, custom: false })),
      modes: capabilities.modes,
      efforts: capabilities.efforts,
      // Как у реестра провайдеров: Antigravity - только свой чат (ADR 0094).
      ...(!worksUnattended(provider) && { chatOnly: true }),
    }),
    getState: () => state,
    refreshUsage: () => Promise.resolve(null),
    getFeed: () => Promise.resolve(feed),
    send: (conversationId, message) => Promise.resolve(record('send', conversationId, message)),
    respond: (conversationId, requestId, response) =>
      record('respond', conversationId, requestId, response),
    interrupt: (conversationId) => record('interrupt', conversationId),
    newConversation: (projectPath, options) => {
      record('newConversation', projectPath, options)
      state.conversations = [
        ...state.conversations,
        own({ id: `${provider}-new`, title: '', projectPath, ...options }),
      ]

      return Promise.resolve(`${provider}-new`)
    },
    close: (conversationId) => Promise.resolve(record('close', conversationId)),
    setOptions: (conversationId, options) => record('setOptions', conversationId, options),
    rename: (conversationId, title) => Promise.resolve(record('rename', conversationId, title)),
    history: (projectPath) => Promise.resolve(projectPath === PROJECT_PATH ? history : []),
    openHistory: (projectPath, sessionId) => {
      record('openHistory', projectPath, sessionId)

      if (!history.some((entry) => entry.sessionId === sessionId)) return Promise.resolve(null)

      state.conversations = [...state.conversations, own({ id: `${provider}-past`, sessionId })]

      return Promise.resolve(`${provider}-past`)
    },
    loadEarlier: () => Promise.resolve(feed),
    image: () => Promise.resolve(null),
    enqueue: (conversationId, message) =>
      Promise.resolve(record('enqueue', conversationId, message)),
    unqueue: (conversationId, queuedId) => record('unqueue', conversationId, queuedId),
    moveQueued: (conversationId, queuedId, toIndex) =>
      record('moveQueued', conversationId, queuedId, toIndex),
    sendQueued: (conversationId, queuedId) =>
      Promise.resolve(record('sendQueued', conversationId, queuedId)),
    forceStop: (conversationId) => record('forceStop', conversationId),
    stopTask: (conversationId, taskId) => record('stopTask', conversationId, taskId),
    rewindPreview: (conversationId, messageId) => {
      record('rewindPreview', conversationId, messageId)

      return Promise.resolve({ state: 'none' })
    },
    rewind: (conversationId, messageId, scope) => {
      record('rewind', conversationId, messageId, scope)

      return Promise.resolve({ rewound: true, prefill: '', filesFailed: null })
    },
  }

  ide.panels.push(port)

  return { port, state, feed, own }
}
