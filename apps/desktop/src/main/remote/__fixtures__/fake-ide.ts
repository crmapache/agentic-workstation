import type { ClaudeState, Conversation, PendingRequest } from '@shared/claude'
import type { FeedItem, ConversationFeed } from '@shared/claude-feed'
import type { ScenarioQueuesView } from '@shared/scenario-queues'
import type { ScenarioSchedule } from '@shared/scenarios'
import type { WorkspaceState } from '@shared/workspace'

import type { BridgePorts } from '../bridge/bridge-ports'
import { accountsOf, historyRunOf, historySummaryOf } from './fake-extras'
import {
  searchOf,
  controlsOf,
  accountsPortOf,
  workspacePortOf,
  connectorsPortOf,
} from './fake-ports'
import { readsOf, picturesOf } from './fake-reads'
import { RUN, LIVE, QUEUE, SCENARIO, PROJECT_PATH } from './fake-scenarios'
import { shelfPortOf } from './fake-shelf'

/**
 * IDE для тестов Remote Control: проект с разговором Claude Code, очередь сценариев с идущим
 * прогоном и подделки сервисов, которые записывают каждый вызов. Пути - настоящие на вид:
 * тесты проверяют, что ни один не уходит телефону.
 */

export const RECENT_PATH = '/Users/someone/Projects/old-thing'

export const CONVERSATION_ID = '6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f'

export const conversationOf = (over: Partial<Conversation> = {}): Conversation => ({
  id: CONVERSATION_ID,
  projectPath: PROJECT_PATH,
  sessionId: '0d1c2b3a-4f5e-6d7c-8b9a-0f1e2d3c4b5a',
  title: 'Fix the login bug',
  titleSource: 'llm',
  groupId: CONVERSATION_ID,
  depth: 0,
  status: 'idle',
  outcome: 'done',
  backgroundWork: false,
  model: 'opus',
  effort: 'high',
  permissionMode: 'default',
  activeModel: 'claude-opus-5-5',
  usage: { contextTokens: 1200, contextWindow: 200_000 },
  pending: null,
  pendingCount: 0,
  queue: [],
  turnStartedAt: null,
  stopRequestedAt: null,
  workStartedAt: null,
  workPausedMs: 0,
  error: null,
  fork: null,
  updatedAt: 1000,
  ...over,
})

/** Вопрос разрешения на запуск команды - как его держит разговор IDE. */
export const PERMISSION: Extract<PendingRequest, { kind: 'permission' }> = {
  kind: 'permission',
  requestId: 'perm-1',
  toolUseId: 'tool-9',
  toolName: 'Bash',
  input: { command: 'pnpm test', description: 'Run the test suite' },
  description: 'pnpm test',
  reason: '',
  alwaysKind: 'rule',
  mode: 'default',
}

export const itemOf = (id: string, text: string): FeedItem =>
  ({ id, kind: 'assistant', text, streaming: false }) as unknown as FeedItem

export { RUN, QUEUE, SCENARIO, PROJECT_PATH }

export type Call = { name: string; args: unknown[] }

/** Подделки сервисов IDE: состояние меняется руками теста, вызовы пишутся в calls. */
export const fakeIde = () => {
  const calls: Call[] = []
  const record = (name: string, ...args: unknown[]): null => {
    calls.push({ name, args })

    return null
  }
  const workspace: WorkspaceState = {
    projects: [{ id: 'p1', name: 'secret-client', rootPath: PROJECT_PATH }],
    activeProjectId: 'p1',
    recentProjects: [{ name: 'old-thing', rootPath: RECENT_PATH }],
  }
  const state = {
    conversations: [conversationOf()],
    models: [],
    accounts: accountsOf(),
  } as unknown as ClaudeState
  const feed: ConversationFeed = {
    conversationId: CONVERSATION_ID,
    items: [itemOf('u1', 'hello'), itemOf('a1', 'Hi! How can I help?')],
    tasks: [],
    hasEarlier: false,
  }
  const queues: ScenarioQueuesView = { queues: [QUEUE], live: [LIVE] }
  const earlier: FeedItem[] = []
  const images = new Map<string, string>()
  const schedules: ScenarioSchedule[] = []
  const extras = {
    record,
    state,
    workspace,
    projectPath: PROJECT_PATH,
    scenario: SCENARIO,
    conversationOf,
  }
  const historyRun = historyRunOf(PROJECT_PATH, RUN)
  const ports: BridgePorts = {
    workspace: workspacePortOf(record, workspace),
    search: searchOf(record, PROJECT_PATH),
    accounts: accountsPortOf(record, state),
    connectors: connectorsPortOf(record),
    conversations: {
      getState: () => state,
      getFeed: () => Promise.resolve(feed),
      send: (id, message) => Promise.resolve(record('send', id, message)),
      respond: (id, requestId, response) => record('respond', id, requestId, response),
      interrupt: (id) => record('interrupt', id),
      // Как ClaudeService.openConversation: выбор ложится на вкладку сразу, ответ - её id.
      newConversation: (projectPath, options) => {
        record('newConversation', projectPath, options)
        state.conversations = [
          ...state.conversations,
          conversationOf({ id: 'new-1', title: '', projectPath, ...options }),
        ]

        return Promise.resolve('new-1')
      },
      close: (id) => {
        record('close', id)
        state.conversations = state.conversations.filter((one) => one.id !== id)

        return Promise.resolve(null)
      },
      setOptions: (id, options) => record('setOptions', id, options),
      rename: (id, title) => Promise.resolve(record('rename', id, title)),
      providers: () =>
        Promise.resolve([
          { id: 'claude', label: 'Claude Code', available: true, unavailable: null },
        ]),
      ...readsOf({
        record,
        state,
        feed,
        earlier,
        images,
        projectPath: PROJECT_PATH,
        conversationId: CONVERSATION_ID,
        conversationOf,
      }),
      ...controlsOf(extras),
    },
    pictures: picturesOf(record),
    scenarios: {
      queuesView: () => queues,
      start: (request) => {
        record('scenarios.start', request)

        return Promise.resolve({ ok: true, queueId: 'q2', itemId: 'i2' })
      },
      act: (queueId, action) => Promise.resolve(record('scenarios.act', queueId, action)),
      run: (projectPath, runId) =>
        Promise.resolve(
          projectPath !== PROJECT_PATH
            ? null
            : ([RUN, historyRun].find((one) => one.id === runId) ?? null),
        ),
      // Как ScenarioService: кнопка, нарисованная для другого состояния, и ответ не на тот
      // вопрос не доходят до прогона.
      control: (projectPath, runId, action, seen) => {
        if ((seen === 'paused') !== (RUN.state === 'paused')) return 'runMoved'

        return record('scenarios.control', projectPath, runId, action)
      },
      answer: (projectPath, runId, allow, text, asked) => {
        const shown = RUN.question

        if (shown?.stepKey !== asked.stepKey || shown.askedAt !== asked.askedAt) return false

        record('scenarios.answer', projectPath, runId, allow, text)

        return true
      },
      tell: (projectPath, runId, text) =>
        record('scenarios.tell', projectPath, runId, text) === null,
      carryOn: (runId) => Promise.resolve(record('scenarios.carryOn', runId)),
      shelves: () =>
        Promise.resolve({
          scenarios: [SCENARIO],
          runs: [historySummaryOf(PROJECT_PATH)],
          schedules,
          schedulesUnread: false,
          canShare: true,
        }),
      ...shelfPortOf(extras, schedules),
    },
  }

  return { ports, calls, state, feed, workspace, queues, earlier, images, schedules }
}
