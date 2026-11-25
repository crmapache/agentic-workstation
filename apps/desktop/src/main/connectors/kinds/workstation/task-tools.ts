import { TASK_KINDS, TASK_MODES, TASK_REPEATS } from '@shared/tasks'

import { stringArg } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { WorkstationPorts } from '../../../workstation/workstation-link'
import { draftOf, taskView } from './task-drafts'
import { timeOf, oneOfArg, projectOf, listScopeOf, PROJECT_ARG } from './workstation-args'
import { taskError } from './workstation-words'

const TASK_ACTIONS = ['run_now', 'enable', 'disable', 'skip_next', 'unskip', 'remove'] as const

const TASK_RUN_ACTIONS = ['stop', 'tell', 'wake'] as const

/** Задания по расписанию и поручения (ADR 0069, 0080): посмотреть, завести, вести прогоны. */
export const TASK_TOOLS: NativeTool<WorkstationPorts>[] = [
  {
    name: 'list_tasks',
    description:
      'Tasks of the IDE: a prompt it runs on a schedule (kind schedule) or a goal it pursues until done (kind goal), each in its own conversation without a tab, and their latest runs.',
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        all_projects: { type: 'boolean', description: 'Tasks of every project. Default false.' },
      },
    },
    run: (args, ports, call) => {
      const view = ports.tasks.view()
      const path = listScopeOf(args, call, ports.projects)
      const tasks = view.tasks.filter((task) => !path || task.projectPath === path)
      const ids = new Set(tasks.map((task) => task.id))

      return Promise.resolve({
        tasks: tasks.map(taskView),
        latestRuns: view.runs
          .filter((run) => ids.has(run.taskId))
          .slice(0, 20)
          .map((run) => ({
            runId: run.id,
            taskId: run.taskId,
            task: run.taskName,
            state: run.state,
            trigger: run.trigger,
            started: timeOf(run.startedAt),
            ended: timeOf(run.endedAt),
            preview: run.preview,
            ...(run.failure && { failure: run.failure }),
            ...(run.asking > 0 && { waitingOnPerson: run.asking }),
          })),
      })
    },
  },
  {
    name: 'get_task_run',
    description: 'A task run in full, with its report (the last words of the run).',
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string' } },
      required: ['run_id'],
    },
    run: (args, ports) => {
      const run = ports.tasks.run(stringArg(args, 'run_id', true))

      if (!run) throw taskError('runGone')

      return Promise.resolve({
        ...run,
        startedAt: timeOf(run.startedAt),
        endedAt: timeOf(run.endedAt),
        dueAt: timeOf(run.dueAt),
        updatedAt: timeOf(run.updatedAt),
      })
    },
  },
  {
    name: 'save_task',
    description: [
      'Create a task, or change one (task_id: give only what changes).',
      'schedule.repeat: manual (only by hand), once (date YYYY-MM-DD at), hourly (at minute of the hour), daily, weekly (days 1 Monday...7 Sunday), monthly (month_day). at is HH:MM local time.',
      'kind goal: a goal pursued until done, the prompt says what result is wanted; no schedule.',
      "permission_mode: leave it out - a new task gets the person's mode for new chats of that provider. You may set a narrower one (default sends every permission question to the notifications and waits for the person, readOnly lets it only read: Codex, open models), never a freer one.",
    ].join(' '),
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        project: PROJECT_ARG,
        kind: { type: 'string', enum: [...TASK_KINDS] },
        name: { type: 'string' },
        prompt: { type: 'string' },
        schedule: {
          type: 'object',
          properties: {
            repeat: { type: 'string', enum: [...TASK_REPEATS] },
            at: { type: 'string', description: 'HH:MM' },
            days: { type: 'array', items: { type: 'number' } },
            month_day: { type: 'number' },
            date: { type: 'string', description: 'YYYY-MM-DD for once.' },
          },
        },
        enabled: { type: 'boolean' },
        catch_up: {
          type: 'boolean',
          description: 'Run once as soon as the IDE is back after a missed time. Default true.',
        },
        report: { type: 'boolean', description: 'Post the report of every run. Default true.' },
        provider: {
          type: 'string',
          description: 'claude, codex, kimi or opencode (antigravity works only in its own chat).',
        },
        model: { type: 'string', description: 'Empty - the default of a new tab.' },
        effort: { type: 'string' },
        permission_mode: { type: 'string', enum: [...TASK_MODES] },
      },
    },
    run: async (args, ports, call) => {
      const draft = await draftOf(args, ports, () => projectOf(args, call, ports.projects))
      const saved = await ports.tasks.save(draft)

      if (!saved.ok) throw taskError(saved.code)

      const task = ports.tasks.task(saved.taskId)

      return task ? taskView(task) : { taskId: saved.taskId }
    },
  },
  {
    name: 'task_action',
    description:
      'Act on a task: run_now (out of schedule), enable, disable, skip_next (skip only the next scheduled time), unskip, remove (its past runs stay).',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        action: { type: 'string', enum: [...TASK_ACTIONS] },
      },
      required: ['task_id', 'action'],
    },
    run: async (args, ports) => {
      const taskId = stringArg(args, 'task_id', true)
      const action = oneOfArg(args, 'action', TASK_ACTIONS)

      if (action === 'run_now') {
        const started = await ports.tasks.runNow(taskId)

        if (!started.ok) throw taskError(started.code)

        return { runId: started.runId }
      }

      const outcome =
        action === 'remove'
          ? await ports.tasks.remove(taskId)
          : action === 'enable' || action === 'disable'
            ? await ports.tasks.setEnabled(taskId, action === 'enable')
            : await ports.tasks.skipNext(taskId, action === 'skip_next')

      if (!outcome.ok) throw taskError(outcome.code)

      return { done: true }
    },
  },
  {
    name: 'task_run_action',
    description:
      'Act on a task run: stop it; tell (text: to a running run - its next message, to a finished one - it continues the conversation); wake a sleeping goal now.',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string' },
        action: { type: 'string', enum: [...TASK_RUN_ACTIONS] },
        text: { type: 'string' },
      },
      required: ['run_id', 'action'],
    },
    run: async (args, ports) => {
      const runId = stringArg(args, 'run_id', true)
      const action = oneOfArg(args, 'action', TASK_RUN_ACTIONS)
      const outcome =
        action === 'stop'
          ? ports.tasks.stop(runId)
          : action === 'wake'
            ? await ports.tasks.wake(runId)
            : await ports.tasks.tell(runId, stringArg(args, 'text', true))

      if (!outcome.ok) throw taskError(outcome.code)

      return { done: true }
    },
  },
]
