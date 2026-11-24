import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'

import {
  capsuleMeta,
  commandLabel,
  fleetPercent,
  taskCapsules,
  countdownText,
  sheetSubtitle,
} from './TaskCapsules.utils'

/** Подстановка вместо i18next: видно, какой ключ взят и с чем. */
const t = ((key: string, options?: Record<string, unknown>) =>
  `${key}${options ? JSON.stringify(options) : ''}`) as unknown as TFunction

const task = (over: Record<string, unknown> = {}) => ({
  taskId: 'task_1',
  kind: 'agent',
  background: true,
  startedAt: 2000,
  endedAt: 0,
  activity: '',
  steps: [],
  trimmed: 0,
  fleet: null,
  outcome: null,
  summary: '',
  ...over,
})

const agent = (id: string, over: Record<string, unknown> = {}): FeedItemWire => ({
  id,
  kind: 'tool',
  name: 'Agent',
  input: { description: 'Review the login code', subagent_type: 'reviewer' },
  action: {
    kind: 'agent',
    agent: 'reviewer',
    description: 'Review the login code',
    prompt: 'Read src/auth and report.',
    workflow: false,
  },
  status: 'running',
  startedAt: 1000,
  endedAt: 0,
  parentToolUseId: null,
  task: task({ activity: 'Reading login.ts' }),
  ...over,
})

const command = (id: string, over: Record<string, unknown> = {}): FeedItemWire => ({
  id,
  kind: 'tool',
  name: 'Bash',
  input: { command: 'pnpm dev --port 5315', run_in_background: true },
  action: { kind: 'command', command: 'pnpm dev --port 5315', description: 'Start the dev server' },
  // Вызов фоновой команды кончается сразу - идёт её задача.
  status: 'done',
  startedAt: 1000,
  endedAt: 1100,
  parentToolUseId: null,
  task: task({ taskId: 'bash_1', kind: 'command', startedAt: 1100 }),
  ...over,
})

describe('капсулы над лентой - идущие задачи разговора, как чипы панели IDE', () => {
  it('живые агенты по порядку запуска, потом фоновые команды и будильники', () => {
    const wakeup: FeedItemWire = {
      id: 'wake',
      kind: 'tool',
      name: 'ScheduleWakeup',
      action: { kind: 'other', target: '' },
      status: 'done',
      parentToolUseId: null,
      task: task({ taskId: '', kind: 'wakeup', dueAt: 9000, activity: 'Check the deploy' }),
    }
    const capsules = taskCapsules({
      items: [command('bash'), wakeup, agent('a1'), agent('a2')],
      steps: { a1: 73 },
    })

    expect(capsules.map((one) => [one.id, one.kind])).toEqual([
      ['a1', 'agent'],
      ['a2', 'agent'],
      ['bash', 'command'],
      ['wake', 'wakeup'],
    ])
    expect(capsules[0]).toMatchObject({
      agent: 'reviewer',
      activity: 'Reading login.ts',
      detail: 'Read src/auth and report.',
      startedAt: 1000,
      steps: 73,
      stop: { taskId: 'task_1', kind: 'agent' },
    })
    expect(capsules[2]).toMatchObject({
      description: 'Start the dev server',
      detail: 'pnpm dev --port 5315',
      startedAt: 1100,
      stop: { taskId: 'bash_1', kind: 'command' },
    })
    // Снять будильник IDE не может: остановки у него нет.
    expect(capsules[3]).toMatchObject({ dueAt: 9000, activity: 'Check the deploy', stop: null })
  })

  it('кончившейся задачи, агента внутри агента и обычного вызова нет', () => {
    expect(
      taskCapsules({
        items: [
          agent('done', { status: 'done', task: task({ outcome: 'completed' }) }),
          agent('inner', { parentToolUseId: 'a1' }),
          command('killed', { task: task({ kind: 'command', outcome: 'stopped' }) }),
          { id: 'read', kind: 'tool', name: 'Read', status: 'running', parentToolUseId: null },
          { id: 'text', kind: 'assistant', text: 'Hi' },
        ],
      }),
    ).toEqual([])
    expect(taskCapsules(undefined)).toEqual([])
  })

  it('флот workflow - долей законченных; агент без имени задачи - без остановки', () => {
    const [fleet, bare] = taskCapsules({
      items: [
        agent('wf', {
          action: { kind: 'agent', agent: '', description: '', prompt: '', workflow: true },
          task: task({ kind: 'workflow', fleet: { total: 4, done: 1 } }),
        }),
        agent('bare', { task: task({ taskId: '' }) }),
      ],
    })

    expect(fleet).toMatchObject({ kind: 'workflow', fleet: { total: 4, done: 1 } })
    expect(fleetPercent(fleet!)).toBe(25)
    expect(bare?.stop).toBeNull()
  })

  it('IDE постарше без вида действия - агент по имени инструмента', () => {
    const [old] = taskCapsules({ items: [agent('old', { action: undefined })] })

    expect(old).toMatchObject({ kind: 'agent', agent: 'reviewer', detail: '' })
    expect(capsuleMeta(old!)).toBe('Reading login.ts')
  })

  it('на капсуле команды - два слова команды, а не описание модели', () => {
    expect(commandLabel('pnpm dev --port 5315')).toBe('pnpm dev')
    expect(commandLabel('./scripts/sandbox.sh --fresh\nnext')).toBe('sandbox.sh')
    expect(capsuleMeta(taskCapsules({ items: [command('bash')] })[0]!)).toBe('pnpm dev')
  })

  it('наблюдатель - капсулой рядом с командами, на ней - описание, в листе - его команда', () => {
    const monitor: FeedItemWire = {
      id: 'watch',
      kind: 'tool',
      name: 'Monitor',
      action: {
        kind: 'monitor',
        command: 'tail -F build.log | grep --line-buffered error',
        url: '',
        description: 'Watch the build for errors',
      },
      status: 'done',
      parentToolUseId: null,
      task: task({ taskId: 'bmon_1', kind: 'monitor', startedAt: 1100 }),
    }
    const capsules = taskCapsules({ items: [monitor, agent('a1'), command('bash')] })

    expect(capsules.map((one) => [one.id, one.kind])).toEqual([
      ['a1', 'agent'],
      ['watch', 'monitor'],
      ['bash', 'command'],
    ])
    expect(capsules[1]).toMatchObject({
      detail: 'tail -F build.log | grep --line-buffered error',
      startedAt: 1100,
      stop: { taskId: 'bmon_1', kind: 'monitor' },
    })
    expect(capsuleMeta(capsules[1]!)).toBe('Watch the build for errors')
  })

  it('под заголовком листа - сколько идёт, у будильника - сколько ждать', () => {
    const [running, wakeup] = taskCapsules({
      items: [
        agent('a1'),
        {
          id: 'wake',
          kind: 'tool',
          name: 'ScheduleWakeup',
          status: 'done',
          parentToolUseId: null,
          task: task({ taskId: '', kind: 'wakeup', dueAt: 61_000 }),
        },
      ],
    })

    expect(sheetSubtitle(t, running!, 6000)).toMatch(/^capsules\.running/)
    expect(sheetSubtitle(t, running!, 6000)).toContain('time.seconds')
    expect(sheetSubtitle(t, wakeup!, 1000)).toMatch(/^capsules\.wakeIn.*time\.minutes/)
  })

  it('до будильника - грубо и вверх, прошедший срок - ноль', () => {
    expect(countdownText(t, 44_100)).toBe('time.seconds{"count":45}')
    expect(countdownText(t, 13 * 60_000 + 1)).toBe('time.minutes{"count":14}')
    expect(countdownText(t, 65 * 60_000)).toBe('time.hoursMinutes{"hours":1,"minutes":5}')
    expect(countdownText(t, -5000)).toBe('time.seconds{"count":0}')
  })
})
