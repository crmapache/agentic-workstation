import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'

import type { Task, TaskRun, TaskCode, TaskFailure, TaskTrigger } from '@shared/tasks'
import { HOUR_MS } from '@shared/time-units'

import { GOAL_SERVER, goalBriefing } from '../goals/goal-briefing'
import { findTranscript } from '../claude/history/transcript-paths'
import type { ClaudeSessions } from '../providers/claude/claude-sessions'
import type { CardAsk } from '../scenarios/engine/run-mail'
import type { SessionSpec } from '../scenarios/engine/scenario-session'
import { taskBriefing } from './task-briefing'
import { LiveRun } from './task-run'
import type { LiveRunHost } from './task-run'

/** Потолок работы прогона без ожидания человека: задание, которое крутится полдня, - сбой. */
export const RUN_CEILING_MS = 3 * HOUR_MS

/** Что прогонам нужно от IDE: процессы провайдера, его модели и аккаунт. */
export type TaskDeskHost = {
  sessions: ClaudeSessions
  defaults: () => { model: string; effort: string }
  accountId: () => string
}

/** Кому прогоны сообщают о себе: книге (запись, окно) и уведомлениям (вопросы, итог). */
export type TaskDeskEvents = {
  changed: (run: TaskRun) => void
  asked: (run: TaskRun, ask: CardAsk) => void
  withdrawn: (run: TaskRun, requestId: string) => void
  finished: (run: TaskRun) => void
  /** Разговор прогона - в книжку скрытых его проекта (история и поиск панели). */
  hide: (projectPath: string, sessionId: string) => void
  /** Поручения (ADR 0080): конец хода, сбой хода, сон - решает стол поручений. */
  goal: Pick<LiveRunHost, 'afterTurn' | 'afterFailure' | 'slept'>
}

/** Ответ человека на вопрос прогона. */
export type TaskAnswer =
  | { kind: 'allow' }
  | { kind: 'deny'; message: string }
  | { kind: 'answers'; answers: Record<string, string> }

const folderExists = (path: string) =>
  stat(path).then(
    (info) => info.isDirectory(),
    () => false,
  )

/**
 * Идущие прогоны заданий: подъём (папка, CLI, доверие), продолжение разговора, ответы на
 * вопросы, остановка и потолок работы. Один живой прогон на запись: продолжение законченного
 * поднимает его разговор заново (`--resume`), а не второй прогон.
 */
export class TaskDesk {
  private readonly live = new Map<string, LiveRun>()
  /**
   * Задания и прогоны, которые поднимаются прямо сейчас (папка, CLI, доверие - секунды): место
   * занимается до первого ожидания, иначе двойной клик или такт посреди подъёма подняли бы второй.
   */
  private readonly raising = new Set<string>()
  /** Задания, удалённые посреди подъёма своего прогона: поднявшийся сразу останавливается. */
  private readonly dropped = new Set<string>()

  constructor(
    private readonly host: TaskDeskHost,
    private readonly events: TaskDeskEvents,
  ) {}

  isLive(runId: string): boolean {
    return this.live.has(runId)
  }

  /** Идёт или поднимается прогон этого задания: второй не поднимается. */
  busyTask(taskId: string): boolean {
    return (
      this.raising.has(taskId) || [...this.live.values()].some((one) => one.run.taskId === taskId)
    )
  }

  /** Задание удалено: его идущие прогоны останавливаются, поднимающийся - сразу после подъёма. */
  drop(taskId: string): void {
    this.dropped.add(taskId)

    for (const live of this.live.values()) if (live.run.taskId === taskId) live.stop()
  }

  bySession(sessionId: string): TaskRun | null {
    return [...this.live.values()].find((one) => one.run.sessionId === sessionId)?.run ?? null
  }

  /** Отметить идущий прогон; false - он не идёт, отметку ставит книга. */
  note(runId: string, patch: Pick<Partial<TaskRun>, 'notified'>): boolean {
    const live = this.live.get(runId)

    live?.note(patch)

    return Boolean(live)
  }

  ask(runId: string, requestId: string): CardAsk | undefined {
    return this.live.get(runId)?.ask(requestId)
  }

  /** Вопрос, который держит сама IDE, идущему прогону этого разговора; нет прогона - нет. */
  hold(sessionId: string, ask: CardAsk, signal?: AbortSignal): Promise<boolean> {
    const live = [...this.live.values()].find((one) => one.run.sessionId === sessionId)

    return live ? live.hold(ask, signal) : Promise.resolve(false)
  }

  /**
   * Новый прогон задания; null - прогон этого задания уже идёт или поднимается. Сбой подъёма -
   * тоже прогон, законченный с причиной.
   */
  async start(task: Task, trigger: TaskTrigger, dueAt: number): Promise<TaskRun | null> {
    if (this.busyTask(task.id)) return null

    const now = Date.now()
    const run: TaskRun = {
      id: randomUUID(),
      taskId: task.id,
      taskName: task.name,
      projectPath: task.projectPath,
      sessionId: randomUUID(),
      trigger,
      state: 'running',
      dueAt,
      startedAt: now,
      endedAt: 0,
      updatedAt: now,
      report: '',
      failure: null,
      skip: null,
      detail: '',
      costUsd: 0,
      asking: 0,
      notified: false,
    }

    this.raising.add(task.id)

    try {
      return await this.raise(run, task, task.prompt, false)
    } finally {
      this.raising.delete(task.id)
    }
  }

  /**
   * Слова прогону: идущему - следующим сообщением, законченному - продолжение его разговора
   * тем же прогоном. task - задание прогона (его режим и модель); нет - как у прогона.
   */
  async tell(run: TaskRun, task: Task | undefined, text: string): Promise<TaskRun | TaskCode> {
    const live = this.live.get(run.id)

    if (live) return live.tell(text) ? live.run : 'startFailed'
    if (this.raising.has(run.id) || this.busyTask(run.taskId)) return 'runBusy'

    this.raising.add(run.id)

    try {
      return await this.raiseAgain(run, task, text)
    } finally {
      this.raising.delete(run.id)
    }
  }

  private async raiseAgain(run: TaskRun, task: Task | undefined, text: string) {
    const resumed =
      Boolean(run.sessionId) && (await findTranscript(run.projectPath, run.sessionId)) !== null
    const again: TaskRun = {
      ...run,
      sessionId: run.sessionId || randomUUID(),
      state: 'running',
      endedAt: 0,
      updatedAt: Date.now(),
      failure: null,
      skip: null,
      detail: '',
      asking: 0,
    }

    return this.raise(again, task ?? null, text, resumed)
  }

  answer(runId: string, requestId: string, answer: TaskAnswer): boolean {
    const live = this.live.get(runId)
    const ask = live?.ask(requestId)

    if (!live || !ask) return false

    if (answer.kind === 'deny') return live.answer(requestId, false, answer.message, ask.input)

    const input = answer.kind === 'answers' ? { ...ask.input, answers: answer.answers } : ask.input

    return live.answer(requestId, true, '', input)
  }

  stop(runId: string): boolean {
    const live = this.live.get(runId)

    live?.stop()

    return Boolean(live)
  }

  /** Такт часов: прогон, который работает дольше потолка, кончается сбоем. */
  checkCeilings(now: number): void {
    for (const live of this.live.values()) {
      if (live.workedMs(now) > RUN_CEILING_MS) live.fail('tooLong')
    }
  }

  /** Выход из IDE: процессы гасятся, записи прогонов дочинит следующий запуск. */
  shutdown(): void {
    for (const live of this.live.values()) live.abandon()

    this.live.clear()
  }

  private async raise(run: TaskRun, task: Task | null, text: string, resume: boolean) {
    const refused = await this.refusal(run.projectPath)

    // Не поднявшийся прогон разговора не начал: продолжать и открывать в чате нечего.
    if (refused) return this.ended(resume ? run : { ...run, sessionId: '' }, refused)
    // Задание удалили, пока шла проверка: процесс не нужен вовсе.
    if (this.dropped.has(run.taskId)) return this.ended({ ...run, sessionId: '' }, null)

    const defaults = this.host.defaults()
    const goal = task?.kind === 'goal' ? task : null
    const spec: SessionSpec = {
      sessionId: run.sessionId,
      resume,
      model: task?.model || defaults.model,
      effort: task?.effort || defaults.effort,
      permissionMode: task?.permissionMode ?? 'default',
      briefing: goal
        ? goalBriefing(goal.name, goal.goal.outbound, Date.now())
        : taskBriefing(task?.name ?? run.taskName, run.trigger, run.dueAt, Date.now()),
      accountId: this.host.accountId(),
      // Инструменты поручения - своим сервером IDE, только этому процессу (ADR 0080).
      ideServers: goal ? [GOAL_SERVER] : [],
    }
    const place = { cwd: run.projectPath, projectPath: run.projectPath }
    const gone = (over: TaskRun) => {
      if (this.live.get(over.id) === live) this.live.delete(over.id)
    }
    const live: LiveRun = new LiveRun(run, spec, {
      spawn: (wanted, wires) => this.host.sessions.spawn(wanted, place, wires),
      changed: (changed) => this.events.changed(changed),
      asked: (asking, ask) => this.events.asked(asking, ask),
      withdrawn: (asking, requestId) => this.events.withdrawn(asking, requestId),
      finished: (finished) => {
        gone(finished)
        this.events.finished(finished)
      },
      ...(goal
        ? {
            afterTurn: this.events.goal.afterTurn,
            afterFailure: this.events.goal.afterFailure,
            slept: (sleeping: TaskRun) => {
              gone(sleeping)
              this.events.goal.slept?.(sleeping)
            },
          }
        : {}),
    })

    this.live.set(run.id, live)
    this.events.hide(run.projectPath, run.sessionId)
    this.events.changed(live.run)
    live.tell(text)

    return live.run
  }

  /** Почему прогон не поднять: папки нет, CLI нет, папке не доверились. */
  private async refusal(projectPath: string): Promise<TaskFailure | null> {
    if (!(await folderExists(projectPath))) return 'folderMissing'

    const code = await this.host.sessions.prepare(projectPath)

    if (code === 'noClaude') return 'noClaude'
    if (code === 'untrusted') return 'untrusted'

    return null
  }

  /** Прогон кончился, не поднявшись: сбой с причиной или остановка (null - задание удалено). */
  private ended(run: TaskRun, failure: TaskFailure | null): TaskRun {
    const now = Date.now()
    const failed: TaskRun = {
      ...run,
      state: failure ? 'failed' : 'stopped',
      failure,
      endedAt: now,
      updatedAt: now,
    }

    this.events.finished(failed)

    return failed
  }
}
