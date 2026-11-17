import type { TaskRun, TaskFailure } from '@shared/tasks'

import { stringField } from '../claude/cli/cli-messages'
import type { CliMessage } from '../claude/cli/cli-messages'
import { spentOf } from '../scenarios/engine/engine-sessions'
import type { CardAsk } from '../scenarios/engine/run-mail'
import { ScenarioSession } from '../scenarios/engine/scenario-session'
import type { SessionSpec, SessionSpawn } from '../scenarios/engine/scenario-session'
import { TurnEndings, BackgroundWork } from '../scenarios/engine/stream-reading'
import { REPORT_MAX } from './task-parse'

/**
 * Чем кончить ход поручения (ADR 0080): done - обычный конец прогона; sleep - уснуть до события,
 * процесс гаснет; nudge - сказать модели ещё слово в том же процессе; end - конец с отчётом модели.
 */
export type TurnVerdict =
  | { kind: 'done' }
  | { kind: 'sleep' }
  | { kind: 'nudge'; text: string }
  | { kind: 'end'; state: 'done' | 'failed'; failure: TaskFailure | null; report: string }

/** Что идущему прогону нужно от сервиса: процесс, отметки о переменах и вопросы человеку. */
export type LiveRunHost = {
  spawn: SessionSpawn
  changed: (run: TaskRun) => void
  asked: (run: TaskRun, ask: CardAsk) => void
  withdrawn: (run: TaskRun, requestId: string) => void
  finished: (run: TaskRun) => void
  /** Поручение: решение по концу хода; нет - прогон по расписанию, конец хода - конец прогона. */
  afterTurn?: (run: TaskRun, result: CliMessage) => TurnVerdict
  /** Поручение: сбой хода - уснуть и повторить позже (true) или кончиться сбоем. */
  afterFailure?: (run: TaskRun, failure: TaskFailure, detail: string) => boolean
  /** Поручение уснуло: процесса больше нет, запись открыта. */
  slept?: (run: TaskRun) => void
}

const reportOf = (endings: readonly string[]) => endings.join('\n\n').trim().slice(0, REPORT_MAX)

/**
 * Идущий прогон задания: разговор CLI без вкладки (тот же ScenarioSession, что у сценариев),
 * его концовки, фоновые помощники, вопросы и деньги. Конец хода при работающих помощниках -
 * ещё не конец: их отчёты поднимут следующий ход сами. Законченный прогон гасит свой процесс -
 * CLI с потоком на входе иначе ждал бы следующего сообщения вечно.
 */
export class LiveRun {
  private readonly session: ScenarioSession
  private readonly endings = new TurnEndings()
  private readonly helpers = new BackgroundWork()
  private readonly asks = new Map<string, CardAsk>()
  /** Вопросы, которые держит сама IDE (отправка людям у поручения), а не CLI. */
  private readonly held = new Map<string, (allow: boolean) => void>()
  private costBefore = 0
  /** Когда поднят этот процесс: продолжение старого прогона считает работу от него. */
  private readonly raisedAt = Date.now()
  private waitingSince = 0
  private waitedMs = 0
  private over = false

  constructor(
    public run: TaskRun,
    spec: SessionSpec,
    private readonly host: LiveRunHost,
  ) {
    this.session = new ScenarioSession(host.spawn, spec, {
      onMessage: (message) => this.heard(message),
      onTurnStarted: () => this.update({}),
      onTurnEnded: (result) => this.turnEnded(result),
      onAsk: (ask) => this.asked(ask),
      onWithdrawn: (requestId) => this.withdrawn(requestId),
      onError: (message) => this.end('failed', 'startFailed', message),
      onCrashed: () => this.failed('crashed', ''),
    })
  }

  get isOver(): boolean {
    return this.over
  }

  /** Слова в разговор: первое сообщение, ответ на уведомление, своё слово человека. */
  tell(text: string): boolean {
    if (this.over) return false

    return this.session.sendPrompt(text)
  }

  ask(requestId: string): CardAsk | undefined {
    return this.asks.get(requestId)
  }

  /** Ответ на вопрос разрешения или вопрос с вариантами; false - вопроса уже нет. */
  answer(requestId: string, allow: boolean, message: string, input: Record<string, unknown>) {
    if (this.over || !this.asks.has(requestId)) return false

    const held = this.held.get(requestId)

    if (held) {
      this.held.delete(requestId)
      held(allow)
    } else {
      this.session.answer(requestId, allow, message, input)
    }

    this.withdrawn(requestId)

    return true
  }

  /**
   * Вопрос, который держит сама IDE: вызов инструмента ждёт кнопки человека (отправка людям у
   * поручения). Ответ - да или нет; кончившийся прогон и отмена вызова - нет.
   */
  hold(ask: CardAsk, signal?: AbortSignal): Promise<boolean> {
    if (this.over) return Promise.resolve(false)

    return new Promise((resolve) => {
      this.held.set(ask.requestId, resolve)
      signal?.addEventListener('abort', () => {
        if (this.held.delete(ask.requestId)) {
          resolve(false)
          this.withdrawn(ask.requestId)
        }
      })
      this.asked(ask)
    })
  }

  /** Отметка на записи идущего прогона (прислал уведомление): иначе следующая перемена её затрёт. */
  note(patch: Pick<Partial<TaskRun>, 'notified'>): void {
    this.update(patch)
  }

  /** Сколько прогон работал, не считая ожидания человека. */
  workedMs(now: number): number {
    const waiting = this.waitingSince ? now - this.waitingSince : 0

    return now - this.raisedAt - this.waitedMs - waiting
  }

  stop(): void {
    this.end('stopped', null, '')
  }

  fail(failure: TaskFailure): void {
    this.end('failed', failure, '')
  }

  /**
   * Выход из IDE: процесс гаснет молча, запись остаётся идущей. Следующий запуск IDE отметит
   * её оборванной и спросит человека, продолжить ли (TaskBook.load).
   */
  abandon(): void {
    this.over = true
    this.session.stop()
  }

  private heard(message: CliMessage) {
    this.endings.read(message)
    this.helpers.read(message)
  }

  private turnEnded(result: CliMessage) {
    const total = typeof result['total_cost_usd'] === 'number' ? result['total_cost_usd'] : null
    const spent = spentOf(total, this.costBefore)

    this.costBefore = total ?? this.costBefore
    this.update({ costUsd: this.run.costUsd + spent, report: reportOf(this.endings.last) })

    if (result['is_error'] === true) {
      return this.failed(
        'turnError',
        stringField(result, 'result') || stringField(result, 'subtype'),
      )
    }

    if (this.helpers.busy()) return

    const verdict = this.host.afterTurn?.(this.run, result) ?? { kind: 'done' }

    switch (verdict.kind) {
      case 'done':
        return this.end('done', null, '')
      case 'sleep':
        return this.sleep()
      case 'nudge':
        if (!this.session.sendPrompt(verdict.text)) this.end('failed', 'startFailed', '')

        return
      case 'end':
        this.update({ report: verdict.report.trim().slice(0, REPORT_MAX) })

        return this.end(verdict.state, verdict.failure, '')
    }
  }

  /** Сбой хода: поручение может уснуть и попробовать позже, прогон по расписанию кончается. */
  private failed(failure: TaskFailure, detail: string) {
    if (this.over) return
    if (this.host.afterFailure?.(this.run, failure, detail)) return this.sleep()

    this.end('failed', failure, detail)
  }

  /** Поручение уснуло до события: процесс гаснет, запись остаётся открытой. */
  private sleep() {
    if (this.over) return

    this.over = true
    this.session.stop()
    this.dropAsks()
    this.run = { ...this.run, state: 'sleeping', asking: 0, updatedAt: Date.now() }
    this.host.slept?.(this.run)
  }

  /** Снять все вопросы: держанные IDE получают «нет», окну - что вопроса больше нет. */
  private dropAsks() {
    const asks = [...this.asks.keys()]

    this.asks.clear()

    for (const resolve of this.held.values()) resolve(false)

    this.held.clear()

    for (const requestId of asks) this.host.withdrawn(this.run, requestId)
  }

  private asked(ask: CardAsk) {
    if (this.over) return

    this.asks.set(ask.requestId, ask)
    if (!this.waitingSince) this.waitingSince = Date.now()
    this.update({ state: 'waiting', asking: this.asks.size })
    this.host.asked(this.run, ask)
  }

  private withdrawn(requestId: string) {
    if (!this.asks.delete(requestId)) return

    if (this.asks.size === 0 && this.waitingSince) {
      this.waitedMs += Date.now() - this.waitingSince
      this.waitingSince = 0
    }

    this.host.withdrawn(this.run, requestId)
    this.update({ state: this.asks.size > 0 ? 'waiting' : 'running', asking: this.asks.size })
  }

  private update(patch: Partial<TaskRun>) {
    if (this.over) return

    this.run = { ...this.run, ...patch, updatedAt: Date.now() }
    this.host.changed(this.run)
  }

  private end(state: TaskRun['state'], failure: TaskFailure | null, detail: string) {
    if (this.over) return

    const now = Date.now()

    this.over = true
    this.session.stop()
    this.run = {
      ...this.run,
      state,
      failure,
      detail: detail.slice(0, 2000),
      asking: 0,
      endedAt: now,
      updatedAt: now,
    }
    this.dropAsks()
    this.host.finished(this.run)
  }
}
