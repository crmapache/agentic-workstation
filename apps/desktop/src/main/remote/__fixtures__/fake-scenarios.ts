import type { ScenarioQueue } from '@shared/scenario-queues'
import type { RunSummary, ScenarioRun } from '@shared/scenario-runs'
import type { Scenario } from '@shared/scenarios'

/**
 * Сценарии для тестов Remote Control: сценарий на полке, очередь в worktree с идущим прогоном и
 * его сводка. Пути - настоящие на вид: тесты проверяют, что ни один не уходит телефону.
 */

export const PROJECT_PATH = '/Users/someone/Projects/secret-client'

export const SCENARIO: Scenario = {
  version: 1,
  id: 'tidy',
  name: 'Tidy up',
  createdAt: 0,
  updatedAt: 0,
  inputs: [{ id: 'what', name: 'what', label: 'What', placeholder: '', required: true }],
  head: {
    briefing: `Keep ${PROJECT_PATH} tidy`,
    model: '',
    effort: '',
    permissionMode: 'default',
    onQuestion: 'stop',
    retries: 1,
    onGiveUp: 'stop',
  },
  stages: [
    {
      id: 's1',
      title: 'Look around',
      repeat: 1,
      untilDone: false,
      cards: [
        {
          id: 'c1',
          title: 'List',
          prompt: `List what is in ${PROJECT_PATH}/src`,
          slots: [],
          dod: '',
          after: '',
          model: '',
          effort: '',
          permissionMode: '',
        },
      ],
    },
  ],
  scope: 'project',
}

export const QUEUE: ScenarioQueue = {
  id: 'q1',
  projectPath: PROJECT_PATH,
  name: 'Cleanup',
  nameSource: 'ai',
  createdAt: 10,
  closedAt: 0,
  workdir: {
    kind: 'worktree',
    path: '/Users/someone/.agentic-workstation/worktrees/secret-client-1/cleanup',
    projectDir: '/Users/someone/.agentic-workstation/worktrees/secret-client-1/cleanup',
    gitBranch: 'scenarios/cleanup',
    baseCommit: 'abc123',
    removed: false,
  },
  items: [
    {
      id: 'i1',
      scenarioId: 'tidy',
      scope: 'project',
      scenarioName: 'Tidy up',
      inputs: { what: 'src' },
      provider: 'claude',
      afterSuccess: false,
      addedAt: 11,
      runId: 'r1',
      state: 'running',
      refusal: null,
    },
  ],
  stopAfterItemId: '',
  hold: null,
  acknowledgedItemId: '',
}

export const RUN: ScenarioRun = {
  id: 'r1',
  projectPath: PROJECT_PATH,
  cwd: QUEUE.workdir.kind === 'worktree' ? QUEUE.workdir.path : PROJECT_PATH,
  provider: 'claude',
  queueId: 'q1',
  itemId: 'i1',
  scenarioId: 'tidy',
  scenarioName: 'Tidy up',
  scope: 'project',
  snapshot: SCENARIO,
  startedAt: 20,
  finishedAt: 0,
  state: 'running',
  runFrom: '',
  inputs: { what: 'src' },
  total: 1,
  headConversationId: 'head',
  steps: [],
  notes: [],
  question: {
    stepKey: 's1:c1:1',
    title: 'Delete old files?',
    tool: 'Bash',
    detail: 'rm',
    options: [],
    askedAt: 30,
  },
  failure: '',
  error: '',
  cost: 0.1,
  tokens: 100,
  idle: 0,
  rested: 0,
  restingSince: 0,
  writtenAt: 30,
  starred: false,
  answering: false,
  limit: null,
  origin: 'ide',
}

export const LIVE: RunSummary = {
  id: 'r1',
  projectPath: PROJECT_PATH,
  provider: 'claude',
  queueId: 'q1',
  itemId: 'i1',
  scenarioId: 'tidy',
  scenarioName: 'Tidy up',
  scope: 'project',
  startedAt: 20,
  finishedAt: 0,
  state: 'running',
  total: 1,
  done: 0,
  failure: '',
  cost: 0.1,
  inputs: { what: 'src' },
  tokens: 100,
  idle: 0,
  rested: 0,
  restingSince: 0,
  stageTitle: 'Look around',
  at: 'Look around',
  asking: 'Delete old files?',
  roadmap: [],
  starred: false,
  limit: null,
  origin: 'ide',
}
