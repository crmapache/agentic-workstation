import type { ClaudeState, Conversation } from '@shared/claude'
import type { AsideExchange } from '@shared/claude-panel'
import type { SearchHit } from '@shared/claude-search'
import type { Scenario } from '@shared/scenarios'
import type { WorkspaceState } from '@shared/workspace'

import type {
  SearchPort,
  AccountsPort,
  WorkspacePort,
  ConnectorsPort,
  ConversationsPort,
} from '../bridge/bridge-ports'
import { CONNECTORS } from './fake-extras'

/**
 * Подделки портов сверх разговора и запуска сценария: очередь и остановки, вопрос сбоку, откат,
 * поиск, аккаунты, коннекторы, недавний проект. Отвечают как сервисы IDE и пишут каждый вызов.
 */

export type Record = (name: string, ...args: unknown[]) => null

export type ExtrasIde = {
  record: Record
  state: ClaudeState
  workspace: WorkspaceState
  projectPath: string
  scenario: Scenario
  conversationOf: (over: Partial<Conversation>) => Conversation
}

type Controls = Omit<
  ConversationsPort,
  | 'getState'
  | 'getFeed'
  | 'send'
  | 'respond'
  | 'interrupt'
  | 'newConversation'
  | 'close'
  | 'setOptions'
  | 'rename'
  | 'providers'
  | 'history'
  | 'openHistory'
  | 'loadEarlier'
  | 'image'
>

const answerOf = (id: string, question: string, over: Partial<AsideExchange>): AsideExchange => ({
  id,
  question,
  askedAt: 1,
  state: 'answered',
  text: '',
  notice: '',
  failure: null,
  message: '',
  retry: null,
  ...over,
})

/** Очередь, остановки, вопрос сбоку и откат - как ConversationActions и панель. */
export const controlsOf = (ide: ExtrasIde): Controls => {
  const queueOf = (id: string) => ide.state.conversations.find((one) => one.id === id)?.queue ?? []
  const setQueue = (id: string, queue: Conversation['queue']) => {
    ide.state.conversations = ide.state.conversations.map((one) =>
      one.id === id ? { ...one, queue } : one,
    )
  }
  const asides = new Map<string, (answer: AsideExchange) => void>()

  return {
    enqueue: (id, message) => {
      ide.record('enqueue', id, message)
      setQueue(id, [
        ...queueOf(id),
        {
          id: `q-${queueOf(id).length + 1}`,
          text: message.text,
          imageCount: message.images.length,
          draft: null,
        },
      ])

      return Promise.resolve(null)
    },
    unqueue: (id, queuedId) => {
      ide.record('unqueue', id, queuedId)
      setQueue(
        id,
        queueOf(id).filter((one) => one.id !== queuedId),
      )

      return null
    },
    moveQueued: (id, queuedId, toIndex) => {
      ide.record('moveQueued', id, queuedId, toIndex)

      const queue = queueOf(id).filter((one) => one.id !== queuedId)
      const moved = queueOf(id).find((one) => one.id === queuedId)

      if (moved) queue.splice(toIndex, 0, moved)
      setQueue(id, queue)

      return null
    },
    sendQueued: (id, queuedId) => {
      ide.record('sendQueued', id, queuedId)
      setQueue(
        id,
        queueOf(id).filter((one) => one.id !== queuedId),
      )

      return Promise.resolve(null)
    },
    forceStop: (id) => ide.record('forceStop', id),
    stopTask: (id, taskId) => ide.record('stopTask', id, taskId),
    cancelCarryOn: (id) => ide.record('cancelCarryOn', id),
    // Как AsideDesk.askFor: занятый id - null; ответ - когда модель кончила, отмена - отменой.
    askAside: (id, question, askId) => {
      ide.record('askAside', id, question, askId)

      if (askId === 'taken') return Promise.resolve(null)
      if (question.startsWith('wait')) {
        return new Promise((resolve) => asides.set(askId, resolve))
      }

      return Promise.resolve(
        answerOf(askId, question, { text: `Working in ${ide.projectPath}/src on it.` }),
      )
    },
    cancelAside: (id, askId) => {
      ide.record('cancelAside', id, askId)
      asides.get(askId)?.(answerOf(askId, '', { state: 'cancelled' }))

      return null
    },
    rewindPreview: (id, messageId) => {
      ide.record('rewindPreview', id, messageId)

      return Promise.resolve({
        state: 'ready',
        files: [`${ide.projectPath}/src/login.ts`, '~/notes.md'],
        count: 2,
        insertions: 4,
        deletions: 1,
      })
    },
    rewind: (id, messageId, scope) => {
      ide.record('rewind', id, messageId, scope)

      return Promise.resolve({
        rewound: true,
        prefill: `Fix ${ide.projectPath}/src/login.ts`,
        filesFailed: null,
      })
    },
  }
}

const hitOf = (projectPath: string, over: Partial<SearchHit> = {}): SearchHit => {
  const snippet = `…opened ${projectPath}/src/login.ts and fixed login…`
  const at = snippet.lastIndexOf('login')

  return {
    conversationId: '0d1c2b3a-4f5e-6d7c-8b9a-0f1e2d3c4b5a',
    uuid: 'u1',
    anchor: 'u1',
    speaker: 'claude',
    at: 500,
    title: 'Fix the login bug',
    titleSource: 'llm',
    messages: 12,
    snippet,
    spans: [[at, at + 5]],
    text: 'long text the phone does not need',
    truncated: false,
    length: 300,
    ...over,
  }
}

export const searchOf = (record: Record, projectPath: string): SearchPort => ({
  find: (path, query) => {
    record('search.find', path, query)

    return Promise.resolve({
      scope: 'project',
      hits: [hitOf(projectPath)],
      terms: [{ term: query, paint: query.length }],
      counts: { chat: 0, project: 1, conversations: 1 },
      total: 1,
      failed: false,
    })
  },
  ask: (path, runId, query) => {
    record('search.ask', path, runId, query)

    return Promise.resolve({
      status: 'found',
      hits: [hitOf(projectPath, { reason: `It edits ${projectPath}/src/login.ts` })],
    })
  },
  cancel: (runId) => void record('search.cancel', runId),
})

export const accountsPortOf = (record: Record, state: ClaudeState): AccountsPort => ({
  refreshUsage: (ids) => Promise.resolve(record('accounts.refreshUsage', ids)),
  use: (id) => {
    record('accounts.use', id)
    state.accounts = { ...state.accounts, current: id }
  },
  rename: (id, alias) => {
    record('accounts.rename', id, alias)
    state.accounts = {
      ...state.accounts,
      accounts: state.accounts.accounts.map((one) => (one.id === id ? { ...one, alias } : one)),
    }
  },
  forget: (id) => {
    record('accounts.forget', id)
    state.accounts = {
      ...state.accounts,
      accounts: state.accounts.accounts.filter((one) => one.id !== id),
    }

    return Promise.resolve(null)
  },
  logout: () => Promise.resolve(record('accounts.logout')),
})

export const connectorsPortOf = (record: Record): ConnectorsPort => ({
  list: () => CONNECTORS,
  reconnect: (id) => Promise.resolve(record('connectors.reconnect', id)),
})

/** Как WorkspaceService.openRecentProject: недавний становится открытым проектом. */
export const workspacePortOf = (record: Record, workspace: WorkspaceState): WorkspacePort => ({
  getState: () => workspace,
  openRecent: (rootPath) => {
    record('workspace.openRecent', rootPath)

    const recent = workspace.recentProjects.find((one) => one.rootPath === rootPath)

    if (recent) workspace.projects = [...workspace.projects, { id: 'p2', ...recent }]

    return Promise.resolve(null)
  },
})
