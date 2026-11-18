import type { GoalSummary, GoalSettings } from './goals'
import type { ProviderId } from './providers'

/**
 * Задания по расписанию (ADR 0069): текст для провайдера, папка проекта и ритм. IDE сама
 * поднимает разговор в свой срок, без человека за столом; вопросы и отчёты прогона уходят в
 * уведомления IDE (shared/inbox.ts). Задание - уровня IDE, а не открытой вкладки проекта.
 */

/** Ритм задания: только вручную, один раз, каждый час, день, по дням недели, раз в месяц. */
export type TaskRepeat = 'manual' | 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly'

export const TASK_REPEATS: readonly TaskRepeat[] = [
  'manual',
  'once',
  'hourly',
  'daily',
  'weekly',
  'monthly',
]

/** Последний день месяца: «31-е» в феврале - это 28-е или 29-е, а не март. */
export const LAST_MONTH_DAY = 31

/**
 * Когда задание идёт. Поля плоские: окно меняет ритм, не теряя остальное (вернулся на
 * «раз в неделю» - дни на месте). Время - местное время машины.
 */
export type TaskSchedule = {
  repeat: TaskRepeat
  /** Минуты от полуночи; у hourly берутся только минуты часа. */
  at: number
  /** Дни недели weekly: 1 - понедельник, 7 - воскресенье. */
  days: number[]
  /** День месяца monthly, 1-31; дней в месяце меньше - последний его день. */
  monthDay: number
  /** День разового запуска, YYYY-MM-DD. */
  date: string
}

/**
 * Режим разрешений прогона. default - каждый вопрос разрешения уходит в уведомления и ждёт
 * человека; остальные - режимы CLI, как у вкладки панели.
 */
export type TaskMode = 'default' | 'acceptEdits' | 'auto' | 'bypassPermissions'

export const TASK_MODES: readonly TaskMode[] = [
  'default',
  'acceptEdits',
  'auto',
  'bypassPermissions',
]

/**
 * Вид задания: schedule - прогон на срок ритма, каждый своим разговором; goal - поручение «до
 * результата» (ADR 0080): одна жизнь, которая работает, засыпает до события и просыпается.
 */
export type TaskKind = 'schedule' | 'goal'

export const TASK_KINDS: readonly TaskKind[] = ['schedule', 'goal']

export type Task = {
  id: string
  kind: TaskKind
  name: string
  /** Папка, в которой идёт разговор: её CLAUDE.md, хуки и коннекторы проекта. */
  projectPath: string
  prompt: string
  schedule: TaskSchedule
  /** Выключенное задание не идёт по расписанию; вручную - идёт. */
  enabled: boolean
  /**
   * Срок прошёл, пока IDE была закрыта или машина спала: запустить один раз, как только IDE
   * снова здесь. Без этого пропуск только отмечается.
   */
  catchUp: boolean
  /** Отчёт каждого законченного прогона - в уведомления. Сбой уходит туда всегда. */
  report: boolean
  provider: ProviderId
  /** Пусто - модель и усилие новой вкладки провайдера. */
  model: string
  effort: string
  permissionMode: TaskMode
  /** Пределы поручения; у задания по расписанию не читаются. */
  goal: GoalSettings
  createdAt: number
  updatedAt: number
  /** Ближайший срок (мс); 0 - нет (вручную, выключено, разовый прошёл, поручение). */
  nextAt: number
}

/** Задание из окна: новое (id null) или правка. Сроки считает главный процесс. */
export type TaskDraft = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'nextAt'> & {
  id: string | null
}

/**
 * Где прогон. running - модель работает; waiting - стоит на вопросе к человеку; sleeping -
 * поручение спит до события, процесса нет; skipped - срок пришёл, а прогона не было (прежний
 * ещё идёт, срок пропущен без наверстывания).
 */
export type TaskRunState =
  'running' | 'waiting' | 'sleeping' | 'done' | 'failed' | 'stopped' | 'skipped'

/** Что подняло прогон: срок, наверстывание пропущенного, человек, ответ на уведомление. */
export type TaskTrigger = 'schedule' | 'catchUp' | 'manual' | 'reply'

/** Почему прогон не дошёл до конца - кодом, текст у окна. */
export type TaskFailure =
  | 'noClaude'
  | 'untrusted'
  | 'folderMissing'
  | 'startFailed'
  | 'crashed'
  | 'turnError'
  | 'tooLong'
  | 'ideClosed'
  | 'overBudget'
  | 'wakeLimit'
  | 'expired'
  | 'gaveUp'

export type TaskSkip = 'busy' | 'missed'

export type TaskRun = {
  id: string
  taskId: string
  /** Имя задания на момент прогона: удалённое задание оставляет историю с именем. */
  taskName: string
  projectPath: string
  /** Разговор CLI прогона; пусто - прогона не было (skipped). */
  sessionId: string
  trigger: TaskTrigger
  state: TaskRunState
  /** Срок расписания, к которому прогон; 0 - не по расписанию. */
  dueAt: number
  startedAt: number
  /** 0 - ещё идёт. */
  endedAt: number
  updatedAt: number
  /** Последние слова прогона - его отчёт. */
  report: string
  failure: TaskFailure | null
  skip: TaskSkip | null
  /** Подробность сбоя от CLI (последняя строка ошибки), по-английски. */
  detail: string
  costUsd: number
  /** Сколько вопросов прогона ждут человека сейчас. */
  asking: number
  /** Прогон сам прислал уведомление - отчёт о конце его не дублирует. */
  notified: boolean
}

/** Прогон в списке: отчёт - только началом, целиком - по tasks:run. */
export type TaskRunSummary = Omit<TaskRun, 'report'> & { preview: string }

export type TasksState = {
  tasks: Task[]
  /** Прогоны всех заданий, новые первыми. */
  runs: TaskRunSummary[]
  /** Жизни поручений, которые ещё не кончились, - сводкой. */
  goals: GoalSummary[]
}

/** Отказ главного процесса словом, на которое у окна есть текст. */
export type TaskCode =
  | 'taskGone'
  | 'runGone'
  | 'runBusy'
  /** Перенос в другой проект, пока прогон идёт или поручение спит (ADR 0081). */
  | 'moveBusy'
  | 'runIdle'
  | 'noName'
  | 'noPrompt'
  | 'badFolder'
  | 'badSchedule'
  | 'notWritten'
  | 'noTranscript'
  | TaskFailure

export type TaskOutcome = { ok: true; state: TasksState } | { ok: false; code: TaskCode }

export type TaskSaved =
  { ok: true; state: TasksState; taskId: string } | { ok: false; code: TaskCode }

export type TaskStarted =
  { ok: true; state: TasksState; runId: string } | { ok: false; code: TaskCode }

/** Прогон ещё идёт: работает или ждёт человека. */
export const isRunLive = (state: TaskRunState): boolean =>
  state === 'running' || state === 'waiting'

/** Прогон не кончился: идёт или поручение спит до события. */
export const isRunOpen = (state: TaskRunState): boolean => isRunLive(state) || state === 'sleeping'
