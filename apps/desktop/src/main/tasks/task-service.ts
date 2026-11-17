import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import type { StepLogPage } from '@shared/scenario-view'
import { afterDue, dueVerdict } from '@shared/task-clock'
import type {
  Task,
  TaskRun,
  TaskDraft,
  TaskSaved,
  TasksState,
  TaskOutcome,
  TaskStarted,
} from '@shared/tasks'

import { StepLogs } from '../scenarios/step-logs'
import { setHiddenConversations } from '../claude/history/hidden-conversations'
import type { CardAsk } from '../scenarios/engine/run-mail'
import { HiddenBook } from '../scenarios/store/hidden-book'
import { LockedFile, projectKey } from '../scenarios/store/locked-file'
import type { TaskBook } from './task-book'
import { RESUME_NOTE } from './task-briefing'
import { TaskDesk } from './task-desk'
import type { TaskAnswer, TaskDeskHost } from './task-desk'
import { summaryOf, draftToTask } from './task-parse'

/** Что задания говорят уведомлениям: вопрос прогона, вопрос снят, прогон кончился. */
export type TaskInboxPort = {
  asked: (run: TaskRun, ask: CardAsk) => void
  withdrawn: (run: TaskRun, requestId: string) => void
  finished: (run: TaskRun, task: Task | undefined) => void
}

export type TaskServiceOptions = {
  dataDir: string
  host: TaskDeskHost
  /** Папка - проект, который IDE знает (открытый, недавний, дом): окну не верим. */
  folderKnown: (path: string) => boolean
  /** Разговор прогона - вкладкой панели: проект открывается, вкладка выбирается. */
  openChat: (projectPath: string, sessionId: string) => Promise<boolean>
  /**
   * Разговор прогона уже открыт вкладкой панели - слова идут туда сообщением, а не вторым
   * процессом на тот же разговор. false - вкладки нет.
   */
  sendToChat: (sessionId: string, text: string) => Promise<boolean>
  onState: (state: TasksState) => void
  /** Прогон кончился - статистике (сессия IDE, не человек). */
  onRunFinished: (run: TaskRun) => void
}

/**
 * Задания по расписанию (ADR 0069): книга заданий и прогонов, часы, идущие прогоны и связь с
 * уведомлениями. Часы тикают у всех заданий IDE, а не только у открытых проектов: «первого
 * числа в девять» не ждёт, пока человек откроет вкладку.
 */
export class TaskService {
  /** Ставят уведомления, когда поднимутся (они строятся после заданий). */
  inbox: TaskInboxPort | null = null
  private readonly desk: TaskDesk
  private readonly hidden = new Map<string, HiddenBook>()
  private readonly logs = new StepLogs()
  private ticking = false

  constructor(
    private readonly book: TaskBook,
    private readonly options: TaskServiceOptions,
  ) {
    this.desk = new TaskDesk(options.host, {
      changed: (run) => this.runChanged(run),
      asked: (run, ask) => this.inbox?.asked(run, ask),
      withdrawn: (run, requestId) => this.inbox?.withdrawn(run, requestId),
      finished: (run) => {
        this.runChanged(run)
        this.options.onRunFinished(run)
        this.inbox?.finished(run, this.book.task(run.taskId))
      },
      hide: (projectPath, sessionId) => void this.hiddenOf(projectPath).note(sessionId),
    })
    setHiddenConversations('tasks', (path) => this.hiddenOf(path).all())
  }

  view(): TasksState {
    return { tasks: this.book.tasks, runs: this.book.runs.map(summaryOf) }
  }

  run(runId: string): TaskRun | null {
    return this.book.run(runId) ?? null
  }

  task(taskId: string): Task | undefined {
    return this.book.task(taskId)
  }

  /** Прогон по разговору CLI - чей вызов пришёл в шлюз коннекторов. */
  runBySession(sessionId: string): TaskRun | null {
    return (
      this.desk.bySession(sessionId) ??
      this.book.runs.find((run) => run.sessionId === sessionId) ??
      null
    )
  }

  async save(draft: TaskDraft): Promise<TaskSaved> {
    const previous = draft.id ? this.book.task(draft.id) : undefined

    if (draft.id && !previous) return { ok: false, code: 'taskGone' }

    const checked = draftToTask(draft, previous ?? null, this.options.folderKnown, Date.now())

    if (typeof checked === 'string') return { ok: false, code: checked }

    const task = previous ? checked : { ...checked, id: randomUUID() }

    if (!(await this.book.putTask(task))) return { ok: false, code: 'notWritten' }

    this.sendState()

    return { ok: true, state: this.view(), taskId: task.id }
  }

  async remove(taskId: string): Promise<TaskOutcome> {
    if (!this.book.task(taskId)) return { ok: false, code: 'taskGone' }

    this.desk.drop(taskId)

    return this.written(await this.book.removeTask(taskId))
  }

  async setEnabled(taskId: string, enabled: boolean): Promise<TaskOutcome> {
    const task = this.book.task(taskId)

    if (!task) return { ok: false, code: 'taskGone' }

    // Включённое снова считает срок от сейчас: время, пока оно было выключено, не наверстывается.
    const nextAt = enabled ? afterDue(task, Date.now()) : 0

    return this.written(
      await this.book.putTask({ ...task, enabled, nextAt, updatedAt: Date.now() }),
    )
  }

  async runNow(taskId: string): Promise<TaskStarted> {
    const task = this.book.task(taskId)

    if (!task) return { ok: false, code: 'taskGone' }
    const run = await this.desk.start(task, 'manual', 0)

    return run ? { ok: true, state: this.view(), runId: run.id } : { ok: false, code: 'runBusy' }
  }

  stop(runId: string): TaskOutcome {
    if (!this.book.run(runId)) return { ok: false, code: 'runGone' }

    return this.desk.stop(runId) ? { ok: true, state: this.view() } : { ok: false, code: 'runIdle' }
  }

  /** Свои слова прогону - идущему или продолжением законченного. */
  async tell(runId: string, text: string): Promise<TaskOutcome> {
    const run = this.book.run(runId)

    if (!run) return { ok: false, code: 'runGone' }
    if (!text.trim()) return { ok: true, state: this.view() }

    // Прогон открыли чатом - он теперь разговор панели: второй процесс писал бы в него наперегонки.
    if (
      !this.desk.isLive(runId) &&
      run.sessionId &&
      (await this.options.sendToChat(run.sessionId, text))
    ) {
      return { ok: true, state: this.view() }
    }

    const told = await this.desk.tell(run, this.book.task(run.taskId), text)

    return typeof told === 'string' ? { ok: false, code: told } : { ok: true, state: this.view() }
  }

  /** Продолжить прогон, который оборвала закрытая IDE. */
  resume(runId: string): Promise<TaskOutcome> {
    return this.tell(runId, RESUME_NOTE)
  }

  /** Тот же запуск заново - новым прогоном задания. */
  async again(runId: string): Promise<TaskOutcome> {
    const run = this.book.run(runId)
    const started = run && (await this.runNow(run.taskId))

    if (!started) return { ok: false, code: 'runGone' }

    return started.ok ? { ok: true, state: started.state } : started
  }

  answer(runId: string, requestId: string, answer: TaskAnswer): boolean {
    return this.desk.answer(runId, requestId, answer)
  }

  ask(runId: string, requestId: string): CardAsk | undefined {
    return this.desk.ask(runId, requestId)
  }

  /** Прогон сам прислал уведомление: отчёт о конце его не повторит. */
  noteNotified(runId: string): void {
    if (this.desk.note(runId, { notified: true })) return

    const run = this.book.run(runId)

    if (run && !run.notified) this.runChanged({ ...run, notified: true })
  }

  async log(runId: string, earlier: boolean): Promise<StepLogPage> {
    const run = this.book.run(runId)

    if (!run?.sessionId) return { found: false, feed: null }

    // Идущий прогон читают заново: его транскрипт растёт.
    if (this.desk.isLive(runId)) this.logs.forget(run.sessionId)

    return this.logs.page(run.projectPath, run.sessionId, earlier)
  }

  /** Разговор прогона - обычной вкладкой панели; идущий не отдаётся: CLI на нём уже есть. */
  async openChat(runId: string): Promise<TaskOutcome> {
    const run = this.book.run(runId)

    if (!run?.sessionId) return { ok: false, code: 'runGone' }
    if (this.desk.isLive(runId)) return { ok: false, code: 'runBusy' }

    await this.hiddenOf(run.projectPath).release(run.sessionId)

    return (await this.options.openChat(run.projectPath, run.sessionId))
      ? { ok: true, state: this.view() }
      : { ok: false, code: 'noTranscript' }
  }

  /**
   * Удар часов: пришедшие сроки поднимают прогоны, давно пропущенные - наверстываются одним
   * прогоном или отмечаются. Срок заданию ставится до подъёма: второй удар, пока идёт подъём,
   * его уже не видит.
   */
  async tick(): Promise<void> {
    if (this.ticking) return

    this.ticking = true

    try {
      const now = Date.now()

      this.desk.checkCeilings(now)

      // Сначала - новые сроки всем пришедшим, без ожиданий между ними: подъём прогона длится
      // секунды, и правка задания за это время не должна откатиться старым снимком.
      const came = this.book.tasks.flatMap((task) => {
        const verdict = dueVerdict(task, now)

        return verdict === 'wait' ? [] : [{ id: task.id, verdict, due: task.nextAt }]
      })

      for (const { id } of came) {
        const task = this.book.task(id)

        if (task) void this.book.putTask({ ...task, nextAt: afterDue(task, now) })
      }

      for (const { id, verdict, due } of came) {
        // Задание удалили или выключили, пока поднимался прогон соседнего, - его срок не нужен.
        const task = this.book.task(id)

        if (!task?.enabled) continue

        if (verdict === 'missed') await this.skip(task, due, 'missed')
        else if (
          !(await this.desk.start(task, verdict === 'catchUp' ? 'catchUp' : 'schedule', due))
        )
          await this.skip(task, due, 'busy')
      }

      this.sendState()
    } finally {
      this.ticking = false
    }
  }

  shutdown(): void {
    this.desk.shutdown()
    setHiddenConversations('tasks', null)
  }

  private async skip(task: Task, dueAt: number, skip: 'busy' | 'missed') {
    const now = Date.now()

    await this.book.putRun({
      id: randomUUID(),
      taskId: task.id,
      taskName: task.name,
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
  }

  private runChanged(run: TaskRun) {
    void this.book.putRun(run)
    this.sendState()
  }

  private written(ok: boolean): TaskOutcome {
    this.sendState()

    return ok ? { ok: true, state: this.view() } : { ok: false, code: 'notWritten' }
  }

  private sendState() {
    this.options.onState(this.view())
  }

  private hiddenOf(projectPath: string): HiddenBook {
    let book = this.hidden.get(projectPath)

    if (!book) {
      const file = new LockedFile(
        join(
          this.options.dataDir,
          'task-conversations',
          projectKey(projectPath),
          'conversations.json',
        ),
      )

      book = new HiddenBook(file, () =>
        Promise.resolve(
          this.book.runs
            .filter((run) => run.projectPath === projectPath && run.sessionId)
            .map((run) => run.sessionId),
        ),
      )
      this.hidden.set(projectPath, book)
    }

    return book
  }
}
