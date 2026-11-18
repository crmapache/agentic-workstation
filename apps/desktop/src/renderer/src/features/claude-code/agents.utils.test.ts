import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { CliTask, FeedItem, FleetAgent, ToolAction, ToolFeedItem } from '@shared/claude-feed'

import {
  streamAgents,
  pendingAgents,
  commandEndText,
  fleetAgentFacts,
  runningCommands,
  selectedStreamOf,
} from './agents.utils'
import { commandLabel } from './StreamSwitcher/StreamSwitcher.utils'

/** Перевод, который видно в проверке: ключ и число. */
const t = ((key: string, options?: { count?: number; outcome?: string; duration?: string }) =>
  [key.split('.').at(-1), options?.count, options?.outcome, options?.duration]
    .filter((part) => part !== undefined)
    .join(':')) as unknown as TFunction

const task = (over: Partial<CliTask> = {}): CliTask => ({
  taskId: 'task-1',
  kind: 'agent',
  background: true,
  startedAt: 1_000,
  endedAt: 0,
  activity: '',
  steps: [],
  trimmed: 0,
  fleet: null,
  outcome: null,
  summary: '',
  ...over,
})

/** Вид действия по имени - как его поставил бы драйвер Claude. */
const actionOf = (name: string): ToolAction =>
  name === 'Bash'
    ? { kind: 'command', command: '', description: '' }
    : { kind: 'agent', agent: '', description: '', prompt: '', workflow: name === 'Workflow' }

const tool = (id: string, name: string, over: Partial<ToolFeedItem> = {}): ToolFeedItem => ({
  kind: 'tool',
  id,
  parentToolUseId: null,
  name,
  input: {},
  action: actionOf(name),
  status: 'running',
  result: null,
  startedAt: 1_000,
  endedAt: 0,
  closedReason: null,
  ...over,
})

const fleetAgent = (over: Partial<FleetAgent> = {}): FleetAgent => ({
  index: 1,
  label: 'review:bugs',
  state: 'running',
  agentId: 'a1',
  model: '',
  durationMs: null,
  startedAt: 1_000,
  tokens: 0,
  toolCalls: 0,
  attempt: 0,
  cached: false,
  error: '',
  prompt: '',
  result: '',
  ...over,
})

describe('pendingAgents', () => {
  it('считает идущих агентов верхнего уровня, без фоновых команд и вложенных', () => {
    const items: FeedItem[] = [
      tool('a', 'Task'),
      tool('w', 'Workflow'),
      tool('s', 'Agent', { task: task() }),
      tool('done', 'Task', { status: 'done' }),
      tool('nested', 'Task', { parentToolUseId: 'a' }),
      tool('bash', 'Bash', { status: 'done', task: task({ kind: 'command' }) }),
    ]

    expect(pendingAgents(items)).toBe(3)
  })
})

describe('чипы потоков', () => {
  it('живые агенты и открытый, даже кончившийся; команды - пока идут', () => {
    const items: FeedItem[] = [
      tool('a', 'Task'),
      tool('b', 'Task', { status: 'done' }),
      tool('c', 'Task', { status: 'done' }),
      tool('cmd', 'Bash', { status: 'done', task: task({ kind: 'command' }) }),
      tool('gone', 'Bash', {
        status: 'done',
        task: task({ kind: 'command', outcome: 'completed' }),
      }),
    ]

    expect(streamAgents(items, 'b').map((item) => item.id)).toEqual(['a', 'b'])
    expect(runningCommands(items).map((item) => item.id)).toEqual(['cmd'])
  })

  it('выбор, чьего вызова больше нет в ленте, - это main', () => {
    const items: FeedItem[] = [tool('a', 'Task')]

    expect(selectedStreamOf({ stream: 'a', fleet: null }, items)).toEqual({
      kind: 'agent',
      itemId: 'a',
    })
    expect(selectedStreamOf({ stream: 'gone', fleet: null }, items)).toBeNull()
    expect(selectedStreamOf(undefined, items)).toBeNull()
  })

  it('окно агента флота важнее потока под ним', () => {
    const fleet = {
      phases: [{ index: 1, title: '', agents: [fleetAgent()] }],
      log: [],
      running: 1,
      done: 0,
      failed: 0,
      total: 1,
    }
    const items: FeedItem[] = [tool('w', 'Workflow', { task: task({ kind: 'workflow', fleet }) })]

    expect(selectedStreamOf({ stream: 'w', fleet: { itemId: 'w', index: 1 } }, items)).toEqual({
      kind: 'fleetAgent',
      itemId: 'w',
      index: 1,
    })
    expect(selectedStreamOf({ stream: 'w', fleet: { itemId: 'w', index: 9 } }, items)).toEqual({
      kind: 'agent',
      itemId: 'w',
    })
  })
})

describe('fleetAgentFacts', () => {
  it('попытка, кэш, время, токены и вызовы - через точку', () => {
    const agent = fleetAgent({
      state: 'done',
      attempt: 2,
      cached: true,
      durationMs: 18_000,
      tokens: 42_100,
      toolCalls: 11,
    })

    expect(fleetAgentFacts(t, agent, 0, { dropped: false, withError: true })).toBe(
      'attempt:2 · cached · 18s · 42k · tools:11',
    )
  })

  it('идущий тикает от начала, оборванный - нет и так и назван', () => {
    const agent = fleetAgent({ startedAt: 1_000 })

    expect(fleetAgentFacts(t, agent, 6_000, { dropped: false, withError: true })).toBe('5.0s')
    expect(fleetAgentFacts(t, agent, 6_000, { dropped: true, withError: true })).toBe('dropped')
  })

  it('причина падения - в строке, но не в шапке окна', () => {
    const agent = fleetAgent({ state: 'failed', startedAt: null, error: 'boom' })

    expect(fleetAgentFacts(t, agent, 0, { dropped: false, withError: true })).toBe('boom')
    expect(fleetAgentFacts(t, agent, 0, { dropped: false, withError: false })).toBe('')
  })
})

describe('commandEndText', () => {
  it('исход и сколько шла; отпущенная - что следить некому', () => {
    expect(commandEndText(t, task({ kind: 'command' }))).toBeNull()
    expect(commandEndText(t, task({ kind: 'command', outcome: 'failed', endedAt: 61_000 }))).toBe(
      'commandEnded:failed:1m 00s',
    )
    expect(commandEndText(t, task({ kind: 'command', outcome: 'untracked' }))).toBe(
      'commandUntracked',
    )
  })
})

describe('commandLabel', () => {
  it('команда двумя словами', () => {
    expect(commandLabel('pnpm dev --port 3000')).toBe('pnpm dev')
    expect(commandLabel('./scripts/sandbox.sh --fast')).toBe('sandbox.sh')
    expect(commandLabel('')).toBe('')
  })
})
