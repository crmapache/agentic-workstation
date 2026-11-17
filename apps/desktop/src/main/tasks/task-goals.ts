import { randomUUID } from 'node:crypto'

import type { TaskRun, TaskCode, TasksState, TaskOutcome } from '@shared/tasks'

import type { OutboundCall } from '../connectors/outbound-gate'
import type { GoalBook } from '../goals/goal-book'
import { WAKE_NOTES } from '../goals/goal-briefing'
import { GoalDesk } from '../goals/goal-desk'
import type { GoalEnd } from '../goals/goal-desk'
import { GoalPatrol } from '../goals/goal-patrol'
import type { GoalProbe, GoalChecker } from '../goals/goal-watch'
import { usageFromResult } from '../claude/conversation/usage'
import type { TaskBook } from './task-book'
import type { TaskDesk, TaskDeskEvents } from './task-desk'
import { REPORT_MAX } from './task-parse'

/** Из чего собраны поручения: книга жизней, вызов на чтение без модели и дешёвая модель. */
export type GoalParts = { book: GoalBook; probe: GoalProbe; checker: GoalChecker }

/** Что поручениям нужно от сервиса заданий. */
export type TaskGoalsHost = {
  book: TaskBook
  desk: () => TaskDesk
  /** Запись прогона поменялась: в книгу и окну. */
  changed: (run: TaskRun) => void
  /** Прогон кончился: книга, статистика, уведомление. */
  finished: (run: TaskRun) => void
  /** Человеку: поручение встало без решения и ждёт его слова. */
  askPerson: (run: TaskRun) => void
  view: () => TasksState
  sendState: () => void
}

const ok = (state: TasksState): TaskOutcome => ({ ok: true, state })

/**
 * Поручения внутри заданий (ADR 0080): стол поручений и патруль, собранные поверх книги и
 * идущих прогонов, и то, что сервис заданий делает с поручением иначе, чем с прогоном по
 * расписанию: начало, слово спящему, остановка спящего, вопрос об отправке людям.
 */
export class TaskGoals {
  readonly desk: GoalDesk
  readonly patrol: GoalPatrol

  constructor(
    private readonly host: TaskGoalsHost,
    parts: GoalParts,
  ) {
    const runs = () => host.book.runs
    const task = (taskId: string) => host.book.task(taskId)

    this.desk = new GoalDesk(parts.book, {
      runs,
      task,
      liveBySession: (sessionId) => host.desk().bySession(sessionId),
      wake: (run, text, chapter) => this.wakeRun(run, text, chapter),
      end: (run, end) => this.endSleeping(run, end),
      askPerson: host.askPerson,
      probe: parts.probe,
      changed: host.sendState,
    })
    this.patrol = new GoalPatrol(this.desk, {
      runs,
      task,
      probe: parts.probe,
      checker: parts.checker,
    })
  }

  /** Решения по концу хода, сбою и сну - идущим прогонам поручений. */
  get hooks(): TaskDeskEvents['goal'] {
    return {
      afterTurn: (run, result) =>
        this.desk.turnEnded(
          run,
          usageFromResult(result, { contextTokens: 0, contextWindow: 0 }, null).contextTokens,
        ),
      afterFailure: (run, _failure, detail) => this.desk.turnFailed(run, detail),
      slept: (run) => this.host.changed(run),
    }
  }

  /** Открытая жизнь поручения (идёт или спит): второй её не поднять. */
  openOf(taskId: string): TaskRun | null {
    return (
      this.host.book.runs.find(
        (run) =>
          run.taskId === taskId &&
          (run.state === 'running' || run.state === 'waiting' || run.state === 'sleeping'),
      ) ?? null
    )
  }

  /** Слово спящему поручению будит его; кончившемуся - продолжает жизнь заново. */
  async tell(run: TaskRun, text: string): Promise<TaskOutcome | null> {
    if (run.state === 'sleeping')
      return this.outcome(await this.desk.wake(run, WAKE_NOTES.person(text), 'person'))

    if (run.state !== 'running' && run.state !== 'waiting') this.desk.resumed(run)

    return null
  }

  /** Разбудить сейчас, не дожидаясь события. */
  async wake(run: TaskRun): Promise<TaskOutcome> {
    if (run.state !== 'sleeping')
      return {
        ok: false,
        code: run.state === 'running' || run.state === 'waiting' ? 'runBusy' : 'runIdle',
      }

    return this.outcome(await this.desk.wake(run, WAKE_NOTES.early(), 'person'))
  }

  /** Остановить спящую жизнь: процесса нет, запись закрывается сама. */
  stopSleeping(run: TaskRun): void {
    this.endSleeping(run, { state: 'stopped', failure: null, report: run.report })
  }

  /**
   * Подтверждение отправки людям: вопрос держит идущий прогон (карточка в уведомлениях с
   * текстом вызова), ответ - кнопкой. Нет прогона - нет и отправки.
   */
  async confirm(sessionId: string, call: OutboundCall, signal: AbortSignal): Promise<boolean> {
    const run = this.host.desk().bySession(sessionId)

    if (!run) return false

    const what = `${call.title} ${call.tool}`

    this.desk.note(run.id, 'confirmAsked', what)

    const allowed = await this.host.desk().hold(
      sessionId,
      {
        requestId: `outbound-${randomUUID()}`,
        toolName: `mcp__${call.server}__${call.tool}`,
        input: call.args,
        description: `Send to other people through ${call.title}`,
      },
      signal,
    )

    this.desk.note(run.id, allowed ? 'confirmed' : 'refused', what)

    return allowed
  }

  private outcome(code: TaskCode | null): TaskOutcome {
    return code ? { ok: false, code } : ok(this.host.view())
  }

  /** Подъём спящей жизни: глава - новый разговор, иначе продолжение того же. */
  private async wakeRun(run: TaskRun, text: string, chapter: boolean): Promise<boolean> {
    this.patrol.stop(run.id)

    const target = chapter ? { ...run, sessionId: randomUUID() } : run

    if (chapter) this.host.changed(target)

    const told = await this.host.desk().tell(target, this.host.book.task(run.taskId), text)

    return typeof told !== 'string' && told.state !== 'failed'
  }

  private endSleeping(run: TaskRun, end: GoalEnd): void {
    const now = Date.now()

    this.patrol.stop(run.id)
    this.host.finished({
      ...run,
      state: end.state,
      failure: end.failure,
      report: (end.report || run.report).slice(0, REPORT_MAX),
      asking: 0,
      endedAt: now,
      updatedAt: now,
    })
  }
}
