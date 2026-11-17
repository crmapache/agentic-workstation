import type {
  GoalLife,
  GoalWait,
  GoalWatch,
  GoalOutcome,
  GoalSummary,
  GoalOutbound,
  GoalEventKind,
} from '@shared/goals'
import type { Task, TaskRun, TaskCode, TaskFailure } from '@shared/tasks'
import { isRunOpen } from '@shared/tasks'

import type { TurnVerdict } from '../tasks/task-run'
import { ArgumentError } from '../connectors/kinds/native-tools'
import type { GoalBook } from './goal-book'
import { TOOL_SAYS, NUDGE_NOTE, WAKE_NOTES, chapterPrompt } from './goal-briefing'
import {
  dayOf,
  limitOf,
  checkGap,
  wakesToday,
  nextCheckOf,
  RETRIES_MAX,
  CHAPTER_TOKENS,
  RETRY_AFTER_MS,
} from './goal-clock'
import { waitOf, newLife, withEvent, JOURNAL_MAX } from './goal-parse'
import type { GoalToolsPort } from './goal-tools'
import { clip, digest, watchLabel } from './goal-watch'
import type { GoalProbe } from './goal-watch'

/** Как кончить жизнь, которая спит: предел, решение модели, остановка, удалённое задание. */
export type GoalEnd = {
  state: 'done' | 'failed' | 'stopped'
  failure: TaskFailure | null
  report: string
}

/** Что столу поручений нужно от заданий: прогоны, их задания, подъём и конец. */
export type GoalDeskHost = {
  runs: () => readonly TaskRun[]
  task: (taskId: string) => Task | undefined
  /** Идущий прогон этого разговора CLI: инструменты зовут из его процесса. */
  liveBySession: (sessionId: string) => TaskRun | null
  /** Разбудить спящую жизнь словами; chapter - новым разговором. false - не поднялась. */
  wake: (run: TaskRun, text: string, chapter: boolean) => Promise<boolean>
  end: (run: TaskRun, end: GoalEnd) => void
  /** Человеку: поручение встало без решения и ждёт его слова. */
  askPerson: (run: TaskRun) => void
  probe: GoalProbe
  changed: () => void
}

/** Кто будит: сторож и срок упираются во все пределы, человек - только в деньги. */
export type WakeBy = 'watch' | 'time' | 'person'

/**
 * Стол поручений (ADR 0080): инструменты модели (wait, journal, finish), решение в конце хода,
 * пробуждение с выбором главы, пределы и продолжение после перезапуска IDE. Проверки сторожей
 * - GoalPatrol; здесь - всё, что меняет саму жизнь.
 */
export class GoalDesk implements GoalToolsPort {
  /** Жизни, которым уже сказали «реши» в этом ходе: второй раз без решения - ждать человека. */
  private readonly nudged = new Set<string>()

  constructor(
    private readonly book: GoalBook,
    private readonly host: GoalDeskHost,
  ) {}

  life(runId: string): GoalLife | null {
    return this.book.life(runId) ?? null
  }

  summaries(): GoalSummary[] {
    return this.host.runs().flatMap((run) => {
      const life = isRunOpen(run.state) ? this.book.life(run.id) : undefined

      if (!life) return []

      const { watches: _watches, ...wait } = life.wait ?? { watches: [] }

      return [
        {
          runId: life.runId,
          taskId: life.taskId,
          wait: life.wait ? (wait as Omit<GoalWait, 'watches'>) : null,
          nextCheckAt: nextCheckOf(life.wait),
          watches: life.wait?.watches.length ?? 0,
          chapters: life.chapters.length + 1,
          checksUsd: life.checksUsd,
        },
      ]
    })
  }

  /** Поднят новый прогон поручения - у него новая жизнь. */
  begin(run: TaskRun): void {
    void this.book.put(newLife(run.id, run.taskId, Date.now()))
    this.host.changed()
  }

  /** Правило отправки людям у разговора; не поручение - null. */
  outboundOf(sessionId: string): GoalOutbound | null {
    const run = this.host.liveBySession(sessionId)
    const task = run ? this.host.task(run.taskId) : undefined

    return task?.kind === 'goal' ? task.goal.outbound : null
  }

  /** Строка истории жизни этого разговора (вопрос об отправке и ответ на него). */
  note(runId: string, kind: GoalEventKind, text: string): void {
    this.edit(runId, (life) => withEvent(life, kind, text, Date.now()))
  }

  async wait(sessionId: string, args: Record<string, unknown>, signal?: AbortSignal) {
    const run = this.goalRun(sessionId)
    const wait = waitOf(args, Date.now())
    const watches: GoalWatch[] = []

    // Первый вызов каждого сторожа - сейчас: сломанный сторож отказывает здесь, а не через неделю.
    for (const watch of wait.watches) {
      watches.push(watch.kind === 'tool' ? await this.baseline(run, watch, signal) : watch)
    }

    this.edit(run.id, (life) => ({
      ...life,
      decided: { kind: 'wait', wait: { ...wait, watches } },
    }))

    return TOOL_SAYS.sleeping
  }

  journal(sessionId: string, text: string): string {
    const run = this.goalRun(sessionId)

    this.edit(run.id, (life) => ({ ...life, journal: text.trim().slice(0, JOURNAL_MAX) }))

    return text.length > JOURNAL_MAX
      ? `Journal saved, but cut to ${JOURNAL_MAX} characters: make it shorter.`
      : TOOL_SAYS.journal
  }

  finish(sessionId: string, outcome: GoalOutcome, report: string): string {
    const run = this.goalRun(sessionId)

    this.edit(run.id, (life) => ({ ...life, decided: { kind: 'finish', outcome, report } }))

    return TOOL_SAYS.finished
  }

  /**
   * Ход кончился: решение модели применяется. Без решения - один раз «реши», второй раз
   * поручение ждёт человека: петлёй «реши» деньги не тратятся.
   */
  turnEnded(run: TaskRun, contextTokens: number): TurnVerdict {
    const now = Date.now()
    const life = this.ensure(run)
    const decided = life.decided
    const base = { ...life, contextTokens, retries: 0, decided: null }

    if (decided?.kind === 'finish') {
      this.nudged.delete(run.id)
      void this.book.put(withEvent(base, 'finished', decided.outcome, now))

      return {
        kind: 'end',
        state: decided.outcome,
        failure: decided.outcome === 'failed' ? 'gaveUp' : null,
        report: decided.report,
      }
    }

    if (decided?.kind === 'wait') {
      this.nudged.delete(run.id)
      void this.book.put(
        withEvent({ ...base, wait: decided.wait }, 'slept', decided.wait.reason, now),
      )
      this.host.changed()

      return { kind: 'sleep' }
    }

    if (!this.nudged.has(run.id)) {
      this.nudged.add(run.id)
      void this.book.put(withEvent(base, 'nudged', '', now))

      return { kind: 'nudge', text: NUDGE_NOTE }
    }

    this.nudged.delete(run.id)
    void this.book.put(withEvent({ ...base, wait: personWait(now) }, 'slept', '', now))
    this.host.askPerson(run)

    return { kind: 'sleep' }
  }

  /** Сбой хода (лимит, сеть, упавший процесс): уснуть и повторить, пока повторов не много. */
  turnFailed(run: TaskRun, detail: string): boolean {
    const life = this.ensure(run)

    if (life.retries >= RETRIES_MAX) return false

    const now = Date.now()
    const wait = timedWait(
      'Retry after an error',
      now + RETRY_AFTER_MS,
      WAKE_NOTES.retry(clip(detail, 300)),
      now,
    )

    void this.book.put(
      withEvent(
        { ...life, retries: life.retries + 1, decided: null, wait },
        'retry',
        clip(detail, 300),
        now,
      ),
    )

    return true
  }

  /**
   * После перезапуска IDE: решение, записанное посреди хода, применяется; оборванная работа
   * встаёт продолжением на ближайший такт (не больше RETRIES_MAX раз подряд).
   */
  restore(): void {
    const now = Date.now()

    for (const run of this.host.runs()) {
      if (run.state !== 'sleeping') continue

      const task = this.host.task(run.taskId)

      if (task?.kind !== 'goal') {
        this.host.end(run, { state: 'stopped', failure: null, report: run.report })
        continue
      }

      const life = this.ensure(run)
      const decided = life.decided

      if (decided?.kind === 'finish') {
        void this.book.put({ ...life, decided: null })
        this.host.end(run, {
          state: decided.outcome,
          failure: decided.outcome === 'failed' ? 'gaveUp' : null,
          report: decided.report,
        })
      } else if (decided?.kind === 'wait') {
        void this.book.put({ ...life, decided: null, wait: decided.wait })
      } else if (!life.wait && life.retries >= RETRIES_MAX) {
        this.host.end(run, { state: 'failed', failure: 'ideClosed', report: life.journal })
      } else if (!life.wait) {
        const wait = timedWait('Continue after the IDE restart', now, WAKE_NOTES.restarted(), now)

        void this.book.put(
          withEvent({ ...life, retries: life.retries + 1, wait }, 'resumed', '', now),
        )
      }
    }
  }

  /**
   * Разбудить: пределы, глава (большой контекст - новый разговор с журналом), счёт за день.
   * null - разбужено; иначе код, почему нет.
   */
  async wake(run: TaskRun, note: string, by: WakeBy): Promise<TaskCode | null> {
    const task = this.host.task(run.taskId)
    const life = this.book.life(run.id)

    if (!task || !life) return 'taskGone'

    const now = Date.now()
    const limit = limitOf(task.goal, run, life, now, by !== 'person')

    if (limit === 'overBudget' || (limit && by !== 'person')) {
      if (by !== 'person') this.endForLimit(run, life, limit)

      return limit
    }

    const chapter = life.contextTokens > CHAPTER_TOKENS
    const text = chapter
      ? chapterPrompt(task.prompt, life.journal, life.chapters.length + 2, note)
      : note

    this.nudged.delete(run.id)
    void this.book.put(
      withEvent(
        {
          ...life,
          wait: null,
          decided: null,
          wakeDay: dayOf(now),
          wakesToday: wakesToday(life, now) + 1,
          chapters: chapter ? [...life.chapters, run.sessionId] : life.chapters,
          contextTokens: chapter ? 0 : life.contextTokens,
        },
        chapter ? 'chapter' : 'woke',
        clip(note.replace(/^Woke up:\s*/, ''), 300),
        now,
      ),
    )
    this.host.changed()

    return (await this.host.wake(run, text, chapter)) ? null : 'startFailed'
  }

  /** Человек продолжил кончившуюся жизнь: срок жизни заново, повторы с нуля. */
  resumed(run: TaskRun): void {
    const now = Date.now()

    this.edit(run.id, (life) =>
      withEvent(
        { ...life, since: now, retries: 0, wait: null, decided: null, wakesToday: 0 },
        'resumed',
        '',
        now,
      ),
    )
  }

  /** Предел: жизнь кончается сбоем, а журнал - её отчётом: человек видит, где оно стоит. */
  endForLimit(run: TaskRun, life: GoalLife, limit: TaskFailure): void {
    const now = Date.now()

    void this.book.put(withEvent({ ...life, wait: null }, 'limit', limit, now))
    this.host.end(run, { state: 'failed', failure: limit, report: life.journal })
  }

  /** Поправить жизнь, если она есть, и сказать окну. */
  edit(runId: string, change: (life: GoalLife) => GoalLife): GoalLife | null {
    const life = this.book.edit(runId, change)

    if (life) this.host.changed()

    return life
  }

  /** Жизнь прогона; её нет (прогон поднят до книги поручений) - новая от начала прогона. */
  private ensure(run: TaskRun): GoalLife {
    const known = this.book.life(run.id)

    if (known) return known

    const life = newLife(run.id, run.taskId, run.startedAt)

    void this.book.put(life)

    return life
  }

  private goalRun(sessionId: string): TaskRun {
    const run = this.host.liveBySession(sessionId)

    if (!run || this.host.task(run.taskId)?.kind !== 'goal') {
      throw new ArgumentError('These tools work only inside a goal of Agentic Workstation.')
    }

    return run
  }

  private async baseline(run: TaskRun, watch: GoalWatch, signal?: AbortSignal) {
    const answer = await this.host.probe(
      run.projectPath,
      watch.server,
      watch.tool,
      watch.args,
      signal ?? AbortSignal.timeout(60_000),
    )

    if ('error' in answer) throw new ArgumentError(`watch ${watchLabel(watch)}: ${answer.error}`)

    const now = Date.now()

    return {
      ...watch,
      hash: digest(answer.text),
      seen: clip(answer.text),
      lastAt: now,
      nextAt: now + checkGap(watch, now),
    }
  }
}

/** Сон, который ставит сама IDE: проснуться в срок с этими словами. */
const timedWait = (reason: string, until: number, note: string, now: number): GoalWait => ({
  reason,
  since: now,
  until,
  person: false,
  watches: [],
  note,
})

/** Ход без решения второй раз подряд: ждать слова человека. */
const personWait = (now: number): GoalWait => ({
  reason: 'Your answer',
  since: now,
  until: 0,
  person: true,
  watches: [],
  note: '',
})
