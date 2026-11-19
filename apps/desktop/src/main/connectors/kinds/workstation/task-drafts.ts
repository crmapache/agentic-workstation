import { DEFAULT_GOAL } from '@shared/goals'
import { TASK_KINDS, TASK_MODES, TASK_REPEATS } from '@shared/tasks'
import type { Task, TaskMode, TaskDraft, TaskSchedule } from '@shared/tasks'

import { numberArg, stringArg, booleanArg, ArgumentError } from '../native-tools'
import type { WorkstationPorts } from '../../../workstation/workstation-link'
import { timeOf, clockOf, oneOfArg, minutesOf, recordArg, providerArg } from './workstation-args'
import { taskError } from './workstation-words'

const PREVIEW_MAX = 400

const scheduleView = (schedule: TaskSchedule) => ({
  repeat: schedule.repeat,
  at: clockOf(schedule.at),
  ...(schedule.repeat === 'weekly' && { days: schedule.days }),
  ...(schedule.repeat === 'monthly' && { monthDay: schedule.monthDay }),
  ...(schedule.repeat === 'once' && { date: schedule.date }),
})

export const taskView = (task: Task) => ({
  id: task.id,
  kind: task.kind,
  name: task.name,
  project: task.projectPath,
  prompt: task.prompt.length > PREVIEW_MAX ? `${task.prompt.slice(0, PREVIEW_MAX)}…` : task.prompt,
  ...(task.kind === 'schedule' && { schedule: scheduleView(task.schedule) }),
  enabled: task.enabled,
  next: timeOf(task.nextAt),
  ...(task.skipAt > 0 && task.skipAt === task.nextAt && { nextSkipped: true }),
  provider: task.provider,
  model: task.model,
  effort: task.effort,
  permissionMode: task.permissionMode,
})

/** Новое задание так же, как его открывает форма окна: каждый будний день в девять. */
const blankDraft = (projectPath: string): TaskDraft => ({
  id: null,
  kind: 'schedule',
  name: '',
  projectPath,
  prompt: '',
  schedule: { repeat: 'daily', at: 9 * 60, days: [1, 2, 3, 4, 5], monthDay: 1, date: '' },
  enabled: true,
  catchUp: true,
  report: true,
  provider: 'claude',
  model: '',
  effort: '',
  permissionMode: 'default',
  goal: DEFAULT_GOAL,
})

/** Прежнее задание как черновик: сроки считает главный процесс заново. */
const keptOf = ({
  createdAt: _c,
  updatedAt: _u,
  nextAt: _n,
  skipAt: _s,
  ...task
}: Task): TaskDraft => task

/** Дни недели: только 1-7, воскресенье - 7, а не 0 (у cron и getDay оно 0 - модель путает). */
const daysArg = (value: unknown, key: string): number[] | undefined => {
  if (value === undefined || value === null) return undefined

  if (
    !Array.isArray(value) ||
    !value.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)
  ) {
    throw new ArgumentError(`"${key}" is a list of weekdays: 1 Monday ... 7 Sunday`)
  }

  return value as number[]
}

/** Ритм из аргумента поверх прежнего: модель называет только то, что меняет. */
const scheduleArg = (args: Record<string, unknown>, base: TaskSchedule): TaskSchedule => {
  const value = recordArg(args, 'schedule')

  if (!value) return base

  return {
    repeat: value['repeat'] === undefined ? base.repeat : oneOfArg(value, 'repeat', TASK_REPEATS),
    at: value['at'] === undefined ? base.at : minutesOf(value['at'], 'schedule.at'),
    days: daysArg(value['days'], 'schedule.days') ?? base.days,
    monthDay: numberArg(value, 'month_day', { min: 1, max: 31, fallback: base.monthDay }),
    date: stringArg(value, 'date') ?? base.date,
  }
}

/** Режимы задания, которые агент ставит сам: каждый шаг спрашивает человека или ничего не пишет. */
export const AGENT_MODES: readonly TaskMode[] = ['default', 'readOnly']

/** Строка поля: нет поля - undefined (оставить прежнее), пустая строка - сброс к умолчанию. */
const textArg = (args: Record<string, unknown>, key: string): string | undefined =>
  args[key] === '' ? '' : stringArg(args, key)

/**
 * Модель, усилие и режим задания. Смена провайдера - как в форме окна (`switchedTo`): модель и
 * усилие - его по умолчанию (имена моделей у провайдеров свои), режим - прежний, если он у нового
 * есть, иначе «спрашивать». Названный режим, которого у провайдера нет, - отказ.
 */
const runnerOf = (args: Record<string, unknown>, base: TaskDraft, ports: WorkstationPorts) => {
  const provider = providerArg(args) ?? base.provider
  const switched = provider !== base.provider
  const modes =
    ports
      .panels()
      .find((port) => port.provider === provider)
      ?.info()?.modes ?? null
  const fits = (mode: TaskMode) => !modes || mode === 'default' || modes.some((one) => one === mode)
  const named =
    args['permission_mode'] === undefined ? null : oneOfArg(args, 'permission_mode', TASK_MODES)

  if (named && !fits(named)) {
    throw new ArgumentError(`${provider} has no permission mode ${named}.`)
  }

  // Режим без вопросов (правки сами, классификатор, bypass) ставит только человек в окне: иначе
  // агент заводил бы себе исполнителя без вопросов. Свой прежний режим задания - не повышение.
  if (named && !AGENT_MODES.includes(named) && named !== base.permissionMode) {
    throw new ArgumentError(
      `Only the person sets permission mode ${named}, in the task window. You can set default or readOnly.`,
    )
  }

  return {
    provider,
    model: textArg(args, 'model') ?? (switched ? '' : base.model),
    effort: textArg(args, 'effort') ?? (switched ? '' : base.effort),
    permissionMode: named ?? (fits(base.permissionMode) ? base.permissionMode : 'default'),
  }
}

/** Задание из аргументов: правка - поверх прежнего, новое - поверх пустого формы. */
export const draftOf = (
  args: Record<string, unknown>,
  ports: WorkstationPorts,
  ownProject: () => string,
): TaskDraft => {
  const taskId = stringArg(args, 'task_id')
  const previous = taskId ? ports.tasks.task(taskId) : undefined

  if (taskId && !previous) throw taskError('taskGone')

  const base: TaskDraft = previous ? keptOf(previous) : blankDraft(ownProject())
  const pick = <T>(value: T | undefined, fallback: T): T => value ?? fallback
  // Перенос в другой проект - только названным проектом: пустое поле - не «сюда».
  const moved = typeof args['project'] === 'string' && args['project'].trim() !== ''

  return {
    ...base,
    kind: args['kind'] === undefined ? base.kind : oneOfArg(args, 'kind', TASK_KINDS),
    name: pick(stringArg(args, 'name'), base.name),
    projectPath: moved ? ownProject() : base.projectPath,
    prompt: pick(stringArg(args, 'prompt'), base.prompt),
    schedule: scheduleArg(args, base.schedule),
    enabled: booleanArg(args, 'enabled', base.enabled),
    catchUp: booleanArg(args, 'catch_up', base.catchUp),
    report: booleanArg(args, 'report', base.report),
    ...runnerOf(args, base, ports),
  }
}
