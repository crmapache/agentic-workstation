import type { AccountsState } from '@shared/claude-accounts'
import type { FeedItem } from '@shared/claude-feed'
import type { Connector } from '@shared/connectors'
import type { RunSummary, ScenarioRun } from '@shared/scenario-runs'
import type { ScenarioHourRequest } from '@shared/scenario-view'
import type { ScenarioSchedule } from '@shared/scenarios'

/**
 * Данные IDE для того, что телефон умеет сверх разговора и запуска сценария (уровень ACC):
 * аккаунты, коннекторы, прогон из истории, расписание, журнал шага. В тексте - настоящие на вид
 * пути, почта и команда с ключом: тесты проверяют, что они не уходят телефону как есть.
 */

/** Сообщение человека, к которому откатывают: UUID строки транскрипта. */
export const MESSAGE_UUID = '1a2b3c4d-5e6f-4a1b-8c9d-0e1f2a3b4c5d'

export const ACCOUNT_ID = '0123456789abcdef'

export const accountsOf = (): AccountsState => ({
  current: '',
  accounts: [
    {
      id: '',
      alias: '',
      email: 'mzpizote@gmail.com',
      plan: 'max',
      signedIn: true,
      external: false,
    },
    {
      id: ACCOUNT_ID,
      alias: 'Work',
      email: 'max@company.example',
      plan: 'team',
      signedIn: true,
      external: false,
    },
    {
      id: 'fedcba9876543210',
      alias: '',
      email: 'old@x.io',
      plan: 'pro',
      signedIn: false,
      external: false,
    },
  ],
  importable: [],
  signingIn: null,
  lastOutcome: null,
  usage: {
    '': {
      windows: [
        { group: 'session', model: '', percent: 64, resetsAt: 5_000, severity: 'warning' },
        { group: 'weekly', model: '', percent: 20, resetsAt: 90_000, severity: 'normal' },
      ],
      extra: null,
      fetchedAt: 1000,
    },
  },
  refusedUntil: { [ACCOUNT_ID]: 7_000 },
})

export const CONNECTORS: Connector[] = [
  {
    id: '2f1e0d9c-8b7a-4f6e-9d5c-4b3a2f1e0d9c',
    kind: 'gmail',
    typeId: null,
    name: null,
    label: 'Work',
    description: '',
    serverName: 'gmail-work',
    account: 'max@company.example',
    url: null,
    command: null,
    service: null,
    auth: null,
    takesToken: false,
    enabled: true,
    signsIn: true,
    signedIn: true,
    status: 'connected',
    failure: null,
    tools: [
      { name: 'search', description: '', access: 'read', enabled: true },
      { name: 'send', description: '', access: 'outbound', enabled: false },
    ],
    availability: { mode: 'all' },
  },
  {
    id: '7c6b5a49-3827-4615-a4b3-c2d1e0f9a8b7',
    kind: 'command',
    typeId: 'type-1',
    name: 'Chatkepr',
    label: '',
    description: '',
    serverName: 'chatkepr',
    account: null,
    url: null,
    command: 'node /Users/someone/Projects/chatkepr/mcp.js --token sk-secret',
    service: null,
    auth: null,
    takesToken: false,
    enabled: true,
    signsIn: false,
    signedIn: false,
    status: 'failed',
    failure: 'unreachable',
    tools: [],
    availability: { mode: 'all' },
  },
]

/** Прогон из истории: очередь его давно закрыта, на телефоне он открывается из истории. */
export const historyRunOf = (projectPath: string, run: ScenarioRun): ScenarioRun => ({
  ...run,
  id: 'r-old',
  queueId: '',
  itemId: '',
  state: 'done',
  finishedAt: 90,
  question: null,
})

export const historySummaryOf = (projectPath: string): RunSummary => ({
  id: 'r-old',
  projectPath,
  provider: 'claude',
  queueId: '',
  itemId: '',
  scenarioId: 'tidy',
  scenarioName: 'Tidy up',
  scope: 'project',
  startedAt: 60,
  finishedAt: 90,
  state: 'done',
  total: 1,
  done: 1,
  failure: '',
  cost: 0.4,
  inputs: { what: `${projectPath}/src` },
  tokens: 900,
  idle: 0,
  rested: 0,
  restingSince: 0,
  stageTitle: '',
  at: '',
  asking: '',
  roadmap: [],
  starred: true,
  limit: null,
  origin: 'ide',
})

export const scheduleOf = (hour: ScenarioHourRequest): ScenarioSchedule => ({
  ...hour,
  id: hour.scheduleId || 'h1',
  nextAt: 123,
  lastAt: 0,
  missedAt: 0,
})

/** Журнал шага: длинный разговор карточки, страницы выше - из транскрипта. */
export const stepLogOf = (projectPath: string): FeedItem[] =>
  Array.from({ length: 5 }, (_, index) => ({
    id: `log-${index}`,
    kind: 'assistant',
    text: `Step ${index} in ${projectPath}/src`,
    streaming: false,
    parentToolUseId: null,
  }))
