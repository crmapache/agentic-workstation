import { it, expect, describe } from 'vitest'

import type { ToolFeedItem } from '@shared/conversation-feed'

import type { CliMessage } from '../cli/cli-messages'
import { withStep } from './agent-tasks'
import { MAX_AGENT_STEPS } from './agent-tasks.constants'
import { FeedBuilder } from './feed-builder'

const clock = () => {
  const state = { now: 1_000_000 }

  return { state, read: () => state.now }
}

const call = (id: string, name: string, input: Record<string, unknown> = {}): CliMessage => ({
  type: 'assistant',
  message: { id: `m-${id}`, content: [{ type: 'tool_use', id, name, input }] },
})

const result = (id: string, text: string): CliMessage => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: id, content: text }] },
})

const system = (subtype: string, fields: Record<string, unknown>): CliMessage => ({
  type: 'system',
  subtype,
  ...fields,
})

const endTurn = (builder: FeedBuilder) =>
  builder.finishTurn({ type: 'result', num_turns: 1, result: 'ok' }, false)

const tool = (builder: FeedBuilder, id: string) =>
  builder.items.find((item): item is ToolFeedItem => item.kind === 'tool' && item.id === id)

/** Workflow, ушедший в фон: подтверждение запуска сразу, флот - фоновой задачей. */
const launchWorkflow = (builder: FeedBuilder) => {
  builder.apply(call('w1', 'Workflow', { description: 'Review the branch' }))
  builder.apply(
    system('task_started', { task_id: 'wf-1', tool_use_id: 'w1', task_type: 'local_workflow' }),
  )
  builder.apply(result('w1', 'Workflow launched in background. Task ID: wf-1'))
}

describe('простой процесса посреди фоновой работы', () => {
  it('идущий workflow держит работу после конца хода, его конец - отпускает', () => {
    const builder = new FeedBuilder()

    launchWorkflow(builder)
    endTurn(builder)

    expect(tool(builder, 'w1')).toMatchObject({ status: 'running' })
    expect(builder.hasBackgroundWork).toBe(true)

    builder.apply(
      system('task_notification', { task_id: 'wf-1', status: 'completed', summary: 'Done' }),
    )

    expect(tool(builder, 'w1')).toMatchObject({ status: 'done', task: { outcome: 'completed' } })
    expect(builder.hasBackgroundWork).toBe(false)
  })

  it('агенты скилла без вызова Task держат работу и встают своими карточками', () => {
    const builder = new FeedBuilder()

    builder.apply(
      system('task_started', {
        task_id: 'bg-a',
        tool_use_id: 'inner-a',
        subagent_type: 'general-purpose',
        description: 'Angle A',
        task_type: 'local_agent',
      }),
    )
    endTurn(builder)

    expect(tool(builder, 'inner-a')).toMatchObject({
      name: 'Agent',
      status: 'running',
      input: { description: 'Angle A', subagent_type: 'general-purpose' },
      task: { taskId: 'bg-a', kind: 'agent', background: true },
    })
    expect(builder.hasBackgroundWork).toBe(true)

    builder.apply(
      system('task_notification', { task_id: 'bg-a', status: 'completed', summary: '2 remarks' }),
    )

    expect(tool(builder, 'inner-a')).toMatchObject({
      status: 'done',
      result: { text: '2 remarks' },
    })
    expect(builder.hasBackgroundWork).toBe(false)
  })

  it('фоновая команда держит процесс, но не работу запроса', () => {
    const builder = new FeedBuilder()

    builder.apply(call('b1', 'Bash', { command: 'pnpm dev', run_in_background: true }))
    builder.apply(
      system('task_started', { task_id: 'sh-1', tool_use_id: 'b1', task_type: 'local_bash' }),
    )
    builder.apply(result('b1', 'Command running in background with ID: sh-1'))
    endTurn(builder)

    expect(builder.hasBackgroundWork).toBe(false)
    expect(builder.hasBackgroundCommands).toBe(true)

    builder.apply(system('task_notification', { task_id: 'sh-1', status: 'failed' }))

    expect(builder.hasBackgroundCommands).toBe(false)
    expect(tool(builder, 'b1')?.task).toMatchObject({ kind: 'command', outcome: 'failed' })
  })

  it('обычная долгая команда того же канала - не фоновая', () => {
    const builder = new FeedBuilder()

    builder.apply(call('b2', 'Bash', { command: 'pnpm check' }))
    builder.apply(
      system('task_started', { task_id: 'sh-2', tool_use_id: 'b2', task_type: 'local_bash' }),
    )

    expect(builder.hasBackgroundCommands).toBe(false)
    expect(tool(builder, 'b2')?.task).toBeUndefined()
  })

  it('смерть процесса закрывает фоновых агентов и отпускает команды', () => {
    const builder = new FeedBuilder()

    launchWorkflow(builder)
    builder.apply(call('b1', 'Bash', { command: 'pnpm dev', run_in_background: true }))
    builder.apply(
      system('task_started', { task_id: 'sh-1', tool_use_id: 'b1', task_type: 'local_bash' }),
    )
    builder.abortBackground('restarted')

    expect(tool(builder, 'w1')).toMatchObject({ status: 'interrupted', closedReason: 'restarted' })
    expect(tool(builder, 'b1')?.task?.outcome).toBe('untracked')
    expect(builder.hasBackgroundWork).toBe(false)
    expect(builder.hasBackgroundCommands).toBe(false)
  })
})

describe('задача за вызовом', () => {
  it('один агент двумя путями - одна карточка с task_id для остановки', () => {
    const time = clock()
    const builder = new FeedBuilder(undefined, time.read)

    builder.apply(call('t1', 'Task', { subagent_type: 'Explore', prompt: 'Find env reads' }))
    builder.apply(
      system('task_started', { task_id: 't1-id', tool_use_id: 't1', task_type: 'local_agent' }),
    )

    expect(builder.items.filter((item) => item.kind === 'tool')).toHaveLength(1)
    expect(tool(builder, 't1')?.task).toMatchObject({ taskId: 't1-id', kind: 'agent' })
  })

  it('шаги из task_progress копятся в журнал агента, у workflow - нет', () => {
    const builder = new FeedBuilder()

    builder.apply(
      system('task_started', { task_id: 'bg-a', tool_use_id: 'x', task_type: 'local_agent' }),
    )
    builder.apply(system('task_progress', { task_id: 'bg-a', last_tool_name: 'Read' }))
    builder.apply(
      system('task_progress', { task_id: 'bg-a', last_tool_name: 'Grep', description: 'Grepping' }),
    )
    launchWorkflow(builder)
    builder.apply(system('task_progress', { task_id: 'wf-1', last_tool_name: 'review:bugs' }))

    expect(tool(builder, 'x')?.task).toMatchObject({
      steps: ['Read', 'Grep'],
      activity: 'Grepping',
    })
    expect(tool(builder, 'w1')?.task?.steps).toEqual([])
  })

  it('отчёт флота ложится в задачу workflow целиком', () => {
    const builder = new FeedBuilder()

    launchWorkflow(builder)
    builder.apply(
      system('task_progress', {
        task_id: 'wf-1',
        workflow_progress: [
          { type: 'workflow_phase', index: 1, title: 'Review' },
          { type: 'workflow_agent', index: 1, label: 'bugs', phaseIndex: 1, state: 'start' },
        ],
      }),
    )

    expect(tool(builder, 'w1')?.task?.fleet).toMatchObject({
      total: 1,
      phases: [{ title: 'Review' }],
    })
  })

  it('остановленный агент закрыт причиной stopped', () => {
    const builder = new FeedBuilder()

    builder.apply(
      system('task_started', { task_id: 'bg-a', tool_use_id: 'x', task_type: 'local_agent' }),
    )
    builder.apply(system('task_notification', { task_id: 'bg-a', status: 'stopped' }))

    expect(tool(builder, 'x')).toMatchObject({
      status: 'interrupted',
      closedReason: 'stopped',
      task: { outcome: 'stopped' },
    })
  })

  it('в транскрипте конец берётся из уведомления, которое CLI написал агенту', () => {
    const builder = new FeedBuilder()

    builder.apply(call('a1', 'Agent'), true)
    builder.apply(result('a1', 'Async agent launched successfully.'), true)
    builder.apply(
      {
        type: 'user',
        message: {
          content:
            '<task-notification><task-id>x</task-id><tool-use-id>a1</tool-use-id>' +
            '<status>failed</status><summary>Agent crashed</summary></task-notification>',
        },
      },
      true,
    )
    builder.finishReplay()

    expect(tool(builder, 'a1')).toMatchObject({
      status: 'error',
      result: { text: 'Agent crashed' },
      task: { outcome: 'failed' },
    })
  })
})

describe('withStep', () => {
  it('держит последние шаги и считает срезанные', () => {
    const builder = new FeedBuilder()

    builder.apply(
      system('task_started', { task_id: 'bg-a', tool_use_id: 'x', task_type: 'local_agent' }),
    )

    const task = tool(builder, 'x')?.task

    if (!task) throw new Error('нет задачи')

    const full = { ...task, steps: Array.from({ length: MAX_AGENT_STEPS }, (_, i) => `s${i}`) }
    const next = withStep({ ...full, trimmed: 4 }, 'last')

    expect(next.steps).toHaveLength(MAX_AGENT_STEPS)
    expect(next.steps.at(-1)).toBe('last')
    expect(next.trimmed).toBe(5)
  })
})
