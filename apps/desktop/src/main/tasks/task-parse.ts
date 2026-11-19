import { ALL_EFFORT_LEVELS } from '@shared/conversation'
import { DEFAULT_GOAL, GOAL_OUTBOUNDS } from '@shared/goals'
import type { GoalSettings } from '@shared/goals'
import { MODEL_NAME_PATTERN } from '@shared/panel-prefs'
import { isProviderId } from '@shared/providers'
import { nextDue, parseDay } from '@shared/task-clock'
import type {
  Task,
  TaskRun,
  TaskCode,
  TaskDraft,
  TaskSchedule,
  TaskRunSummary,
} from '@shared/tasks'
import { TASK_KINDS, TASK_MODES, TASK_REPEATS, LAST_MONTH_DAY } from '@shared/tasks'

/** Пределы: имя - строка списка, текст - задание, отчёт - концовка разговора. */
export const NAME_MAX = 120
export const PROMPT_MAX = 20_000
export const REPORT_MAX = 16_000
const PREVIEW_MAX = 280

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '')

const number = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  Math.min(max, Math.max(min, Math.round(number(value, fallback))))

export const scheduleOf = (raw: unknown): TaskSchedule => {
  const stored = isRecord(raw) ? raw : {}
  const days = Array.isArray(stored['days']) ? stored['days'] : []

  return {
    repeat: TASK_REPEATS.find((repeat) => repeat === stored['repeat']) ?? 'manual',
    at: clamp(stored['at'], 0, 24 * 60 - 1, 9 * 60),
    days: [...new Set(days.map((day) => clamp(day, 1, 7, 1)))].sort(),
    monthDay: clamp(stored['monthDay'], 1, LAST_MONTH_DAY, 1),
    date: parseDay(text(stored['date'], 10)) ? text(stored['date'], 10) : '',
  }
}

/** Пределы поручения: деньги - от цента до тысячи, дни жизни - от одного до года. */
export const goalOf = (raw: unknown): GoalSettings => {
  const stored = isRecord(raw) ? raw : {}
  const budget = number(stored['budgetUsd'], DEFAULT_GOAL.budgetUsd)

  return {
    outbound: GOAL_OUTBOUNDS.find((one) => one === stored['outbound']) ?? DEFAULT_GOAL.outbound,
    budgetUsd: Math.min(1000, Math.max(0.01, Math.round(budget * 100) / 100)),
    lifeDays: clamp(stored['lifeDays'], 1, 365, DEFAULT_GOAL.lifeDays),
  }
}

const modelOf = (value: unknown) => {
  const model = text(value, 120).trim()

  return MODEL_NAME_PATTERN.test(model) && !model.startsWith('-') ? model : ''
}

/** Уровень усилия любого провайдера: каким он годится модели, решает переводчик провайдера. */
const effortOf = (value: unknown) => ALL_EFFORT_LEVELS.find((level) => level === value) ?? ''

/** Задание с диска: чужое и битое поле - значением по умолчанию, а не отказом всего файла. */
export const taskOf = (raw: unknown): Task | null => {
  if (!isRecord(raw) || typeof raw['id'] !== 'string' || !raw['id']) return null

  return {
    id: raw['id'],
    kind: TASK_KINDS.find((kind) => kind === raw['kind']) ?? 'schedule',
    name: text(raw['name'], NAME_MAX),
    projectPath: text(raw['projectPath'], 4096),
    prompt: text(raw['prompt'], PROMPT_MAX),
    schedule: scheduleOf(raw['schedule']),
    enabled: raw['enabled'] !== false,
    catchUp: raw['catchUp'] !== false,
    report: raw['report'] !== false,
    provider: isProviderId(raw['provider']) ? raw['provider'] : 'claude',
    model: modelOf(raw['model']),
    effort: effortOf(raw['effort']),
    permissionMode: TASK_MODES.find((mode) => mode === raw['permissionMode']) ?? 'default',
    goal: goalOf(raw['goal']),
    createdAt: number(raw['createdAt']),
    updatedAt: number(raw['updatedAt']),
    nextAt: number(raw['nextAt']),
  }
}

const RUN_STATES = [
  'running',
  'waiting',
  'sleeping',
  'done',
  'failed',
  'stopped',
  'skipped',
] as const
const TRIGGERS = ['schedule', 'catchUp', 'manual', 'reply'] as const
const FAILURES = [
  'noClaude',
  'noCli',
  'untrusted',
  'folderMissing',
  'startFailed',
  'crashed',
  'turnError',
  'tooLong',
  'ideClosed',
  'overBudget',
  'wakeLimit',
  'expired',
  'gaveUp',
] as const
const SKIPS = ['busy', 'missed'] as const

/** Прогон с диска. Идущий прогон после перезапуска IDE уже не идёт - его чинит книга. */
export const runOf = (raw: unknown): TaskRun | null => {
  if (!isRecord(raw) || typeof raw['id'] !== 'string' || typeof raw['taskId'] !== 'string') {
    return null
  }

  return {
    id: raw['id'],
    taskId: raw['taskId'],
    taskName: text(raw['taskName'], NAME_MAX),
    // Прогоны до провайдеров (этап 5) шли на Claude Code.
    provider: isProviderId(raw['provider']) ? raw['provider'] : 'claude',
    projectPath: text(raw['projectPath'], 4096),
    sessionId: text(raw['sessionId'], 64),
    trigger: TRIGGERS.find((one) => one === raw['trigger']) ?? 'manual',
    state: RUN_STATES.find((one) => one === raw['state']) ?? 'failed',
    dueAt: number(raw['dueAt']),
    startedAt: number(raw['startedAt']),
    endedAt: number(raw['endedAt']),
    updatedAt: number(raw['updatedAt']),
    report: text(raw['report'], REPORT_MAX),
    failure: FAILURES.find((one) => one === raw['failure']) ?? null,
    skip: SKIPS.find((one) => one === raw['skip']) ?? null,
    detail: text(raw['detail'], 2000),
    costUsd: number(raw['costUsd']),
    asking: 0,
    notified: raw['notified'] === true,
  }
}

/** Отчёт в списке - началом, одной строкой. */
export const summaryOf = ({ report, ...run }: TaskRun): TaskRunSummary => {
  const line = report.replace(/\s+/g, ' ').trim()

  return {
    ...run,
    preview: line.length > PREVIEW_MAX ? `${line.slice(0, PREVIEW_MAX - 1)}…` : line,
  }
}

/**
 * Задание из окна, проверенное: имя и текст есть, ритм встаёт в календарь (разовый - в
 * будущем), папка - одна из известных IDE. Окну не верим: всё, кроме этих полей, считает
 * главный процесс. Другая папка у прежнего задания - перенос в другой проект (ADR 0081).
 */
export const draftToTask = (
  draft: TaskDraft,
  previous: Task | null,
  folderKnown: (path: string) => boolean,
  now: number,
): Task | TaskCode => {
  const task = taskOf({
    ...draft,
    id: previous?.id ?? 'new',
    createdAt: previous?.createdAt ?? now,
  })

  if (!task) return 'taskGone'

  const name = task.name.trim()
  const prompt = task.prompt.trim()

  if (!name) return 'noName'
  if (!prompt) return 'noPrompt'
  // Папка прежнего задания остаётся его папкой, даже если ушла из недавних проектов; новая
  // папка (новое задание или перенос) - только проект, который IDE знает.
  if (task.projectPath !== previous?.projectPath && !folderKnown(task.projectPath)) {
    return 'badFolder'
  }

  // Поручение сроков не знает: идёт, пока не добьётся своего (ADR 0080).
  if (task.kind === 'goal') return { ...task, name, prompt, updatedAt: now, nextAt: 0 }

  const sameRhythm =
    previous !== null && JSON.stringify(previous.schedule) === JSON.stringify(task.schedule)
  const due = nextDue(task.schedule, now)

  // Разовый в прошлом - отказ, только если ритм правили: прошедшему можно поменять имя и текст.
  if (task.schedule.repeat === 'once' && due === 0 && !sameRhythm) return 'badSchedule'

  // Ритм прежний, а срок уже пришёл и такт до него не дошёл: правка имени не съедает запуск.
  const kept =
    sameRhythm && previous.enabled && previous.nextAt > 0 && previous.nextAt <= now
      ? previous.nextAt
      : due

  return {
    ...task,
    name,
    prompt,
    updatedAt: now,
    nextAt: task.enabled ? kept : 0,
  }
}

/** Срок пришёл, а прогона не было: запись пропуска без разговора. */
export const skippedRun = (
  task: Task,
  id: string,
  dueAt: number,
  skip: 'busy' | 'missed',
  now: number,
): TaskRun => ({
  id,
  taskId: task.id,
  taskName: task.name,
  provider: task.provider,
  projectPath: task.projectPath,
  sessionId: '',
  trigger: 'schedule',
  state: 'skipped',
  dueAt,
  startedAt: now,
  endedAt: now,
  updatedAt: now,
  report: '',
  failure: null,
  skip,
  detail: '',
  costUsd: 0,
  asking: 0,
  notified: false,
})
