import { sep, join } from 'node:path'

import type { ImageAttachment } from '@shared/conversation'
import type { ProviderId } from '@shared/providers'
import { worksUnattended } from '@shared/providers'
import type {
  QueueAction,
  WorktreeFacts,
  WorktreeAction,
  ScenarioQueuesView,
  ScenarioStartOutcome,
  ScenarioStartRequest,
  QueuePlaceholderRequest,
} from '@shared/scenario-queues'
import type { RunState, ScenarioRun, RunQuestionRef } from '@shared/scenario-runs'
import { isRunFinished } from '@shared/scenario-runs'
import type {
  StepLogPage,
  RunControlRefusal,
  ScenarioRunControl,
  ScenarioHourRequest,
  ScenarioShelvesView,
} from '@shared/scenario-view'
import type { ScenarioCode } from '@shared/scenarios'

import type { ScenarioProvider } from '../providers/scenario-provider'
import { JsonFile } from '../storage/json-file'
import { setHiddenConversations } from '../claude/history/hidden-conversations'
import { claudeHome } from '../claude/history/transcript-paths'
import { QueueRunner } from './queue-runner'
import { queueWorktree } from './queue-worktree'
import { RunDesk } from './run-desk'
import { tickHours, scheduleHour, unscheduleHour } from './scenario-hours'
import { ScenarioShelves } from './scenario-shelves'
import { StepLogs } from './step-logs'
import { QueueBook } from './queues/queue-book'
import { folderLines, recoverWithTurn } from './queues/queue-folder'
import { runningItem } from './queues/queue-rules'
import { ACC_HOME } from './store/acc-runs'

/** Раз в полминуты: часы расписания и шаг очередей - страховка, двигаются они и сами. */
const BEAT_MS = 30_000

export type ScenarioEvents = {
  onQueues: (view: ScenarioQueuesView) => void
  onShelves: (projectPath: string, view: ScenarioShelvesView) => void
  onRun: (projectPath: string, run: ScenarioRun) => void
  /** Системное уведомление: прогон кончился, встал на вопросе, очередь остановилась. */
  notify: (title: string, body: string) => void
  /** Открыть папку вкладкой проекта (worktree очереди). */
  openProject: (path: string) => void
}

export type ScenarioServiceOptions = {
  dataDir: string
  /** Папка CLI с личной полкой; тесты дают свою, чтобы не читать настоящую. */
  claudeHome?: () => Promise<string>
  /** Дом плагина ACC с его прогонами; тесты дают свой. */
  accHome?: string
  worktreesRoot: string
  providers: readonly ScenarioProvider[]
  /** Провайдер служебной работы (Settings → AI): имена очередей и черновики сценариев. */
  service?: (() => ProviderId) | undefined
  events: ScenarioEvents
}

/**
 * Сценарии на уровне IDE (ADR 0039): очереди всех проектов, по столу прогонов на проект,
 * провайдеры-исполнители, расписание, полки и журнал шага. Процессы прогонов - дети IDE:
 * выход ждёт их, а идущие прогоны пишутся остановленными.
 */
export class ScenarioService {
  private readonly desks = new Map<string, RunDesk>()
  private readonly providers: ReadonlyMap<ProviderId, ScenarioProvider>
  private readonly logs = new StepLogs()
  /** Прогон кончился - для статистики: ставит связка статистики. */
  onRunFinished: (run: ScenarioRun) => void = () => undefined
  readonly runner: QueueRunner
  readonly shelves: ScenarioShelves
  private readonly clock: NodeJS.Timeout
  private open: readonly string[] = []
  private closing = false
  /** Очереди, чей worktree сейчас удаляется: им не стартовать и не принимать сценарии. */
  private readonly removing = new Set<string>()

  private constructor(
    private readonly book: QueueBook,
    private readonly options: ScenarioServiceOptions,
  ) {
    this.providers = new Map(options.providers.map((provider) => [provider.id, provider]))
    this.runner = new QueueRunner({
      book,
      desk: (path) => this.desk(path),
      provider: (id) => this.providers.get(id) ?? null,
      service: options.service,
      worktreesRoot: options.worktreesRoot,
      onQueues: () => this.sendQueues(),
      notify: options.events.notify,
      isClosing: () => this.closing,
      removing: this.removing,
    })
    this.shelves = new ScenarioShelves({
      desk: (path) => this.desk(path),
      provider: (id) => this.providers.get(id) ?? null,
      service: options.service,
      dataDir: options.dataDir,
      onShelves: (path) => this.sendShelves(path),
    })
    setHiddenConversations('scenarios', (path) => this.hiddenFor(path))
    this.clock = setInterval(() => void this.beat(), BEAT_MS)
    this.clock.unref()
  }

  static async load(options: ScenarioServiceOptions): Promise<ScenarioService> {
    const book = await QueueBook.load(new JsonFile(join(options.dataDir, 'scenario-queues.json')))
    const service = new ScenarioService(book, options)

    await service.recover()
    // Элементы, поставленные до правки сценария или старым выпуском, - на чём идут сейчас.
    void service.runner.refreshRunsOn()

    return service
  }

  desk(projectPath: string): RunDesk {
    let desk = this.desks.get(projectPath)

    if (!desk) {
      desk = new RunDesk({
        projectPath,
        dataDir: this.options.dataDir,
        claudeHome: this.options.claudeHome ?? claudeHome,
        accHome: this.options.accHome ?? ACC_HOME,
        onLive: () => this.sendQueues(),
        onRun: (run) => this.options.events.onRun(projectPath, run),
        onFinished: (run) => {
          void this.runner.finished(run)
          this.sendShelves(projectPath)
          this.onRunFinished(run)
        },
        notify: this.options.events.notify,
      })
      this.desks.set(projectPath, desk)
    }

    return desk
  }

  /** Открытые проекты: их часы тикают, брошенные прогоны закрываются при открытии. */
  projectsChanged(paths: readonly string[]): void {
    this.open = paths

    for (const path of paths) void this.desk(path).sweep()
  }

  /** Исходный проект папки worktree какой-нибудь очереди; null - это не worktree очереди. */
  originOf(path: string): string | null {
    const owner = this.book
      .all()
      .find(
        (queue) =>
          queue.workdir.kind === 'worktree' &&
          (path === queue.workdir.path || path.startsWith(`${queue.workdir.path}${sep}`)),
      )

    return owner?.projectPath ?? null
  }

  queuesView(): ScenarioQueuesView {
    const all = this.book.all()

    return {
      // Закрытая очередь с живым worktree остаётся на виду: открыть или удалить его можно только
      // с её карточки (решение владельца - worktree живёт, пока человек его не удалит).
      queues: all.filter(
        (queue) =>
          queue.closedAt === 0 || (queue.workdir.kind === 'worktree' && !queue.workdir.removed),
      ),
      live: [...this.desks.values()].flatMap((desk) => desk.liveRuns()),
      folders: folderLines(all, Date.now()),
    }
  }

  /** Запуск сценария: в новую очередь или в конец существующей; проверки - в постановке. */
  start(request: ScenarioStartRequest): Promise<ScenarioStartOutcome> {
    return this.runner.start(request)
  }

  /** Пометка в очередь - карточка трекера без сценария на своём месте (ADR 0105). */
  startPlaceholder(request: QueuePlaceholderRequest): Promise<ScenarioStartOutcome> {
    return this.runner.startPlaceholder(request)
  }

  act(queueId: string, action: QueueAction): Promise<ScenarioCode | null> {
    return this.runner.act(queueId, action)
  }

  async worktreeFacts(queueId: string): Promise<WorktreeFacts | null> {
    const queue = this.book.get(queueId)

    return queue ? queueWorktree.facts(queue) : null
  }

  async worktree(queueId: string, action: WorktreeAction): Promise<ScenarioCode | null> {
    const queue = this.book.get(queueId)

    if (!queue) return 'queueGone'
    if (queue.workdir.kind !== 'worktree' || queue.workdir.removed) return 'worktreeFailed'
    if (action.kind === 'open') {
      this.options.events.openProject(queue.workdir.path)

      return null
    }

    // Пока очередь в работе, её папку не трогают: прогон писал бы в удалённую.
    if (runningItem(queue)) return 'queueBusy'

    return queueWorktree.remove(queue, action.force, {
      book: this.book,
      onQueues: () => this.sendQueues(),
      worktreesRoot: this.options.worktreesRoot,
      removing: this.removing,
    })
  }

  run(projectPath: string, runId: string): Promise<ScenarioRun | null> {
    return this.desk(projectPath).run(runId)
  }

  /** seen - для какого состояния нарисована кнопка (телефон); окно IDE его не передаёт. */
  control(
    projectPath: string,
    runId: string,
    action: ScenarioRunControl,
    seen?: RunState,
  ): RunControlRefusal | null {
    const refusal = this.desks.get(projectPath)?.control(runId, action, seen) ?? 'runOver'

    // Пауза и продолжение рукой главнее рабочих часов: проснувшись, очередь этот прогон не тронет.
    if (!refusal) this.runner.touched(runId)

    return refusal
  }

  carryOn(runId: string): Promise<ScenarioCode | null> {
    return this.runner.carryOn(runId)
  }

  /** asked - какой вопрос видел отвечающий (телефон); false - его уже нет, ответ не лёг. */
  answer(
    projectPath: string,
    runId: string,
    allow: boolean,
    text: string,
    asked?: RunQuestionRef,
  ): boolean {
    return this.desks.get(projectPath)?.answer(runId, allow, text, asked) ?? false
  }

  tell(projectPath: string, runId: string, text: string, images: ImageAttachment[]) {
    return this.desks.get(projectPath)?.tell(runId, text, images, null) ?? false
  }

  /** Лог шага: его разговор, только если он и правда этого прогона. */
  async log(
    projectPath: string,
    runId: string,
    key: string,
    earlier: boolean,
  ): Promise<StepLogPage> {
    const run = await this.desk(projectPath).run(runId)
    const step = run?.steps.find((one) => one.key === key)
    const conversationId = key === 'head' ? run?.headConversationId : step?.conversationId

    if (!run || !conversationId) return { found: false, feed: null }

    // Идущую карточку читают заново: её транскрипт растёт.
    if (!step || step.finishedAt === 0) this.logs.forget(conversationId)

    return this.logs.page(
      this.providers.get(run.provider)?.stepFeed ?? null,
      run.cwd || projectPath,
      conversationId,
      earlier,
    )
  }

  /**
   * Разговор головы - обычной вкладкой панели провайдера, с роли главного потока снятой. Прогон
   * в worktree: сначала его папка открывается проектом - вкладки панели живут по проектам.
   */
  async openChat(projectPath: string, runId: string): Promise<ScenarioCode | null> {
    const desk = this.desk(projectPath)
    const run = await desk.run(runId)
    const provider = run && this.providers.get(run.provider)

    if (!run || !run.headConversationId) return 'runGone'
    if (desk.live.has(runId)) return 'runBusy'
    // Идущий прогон ACC ведёт ACC: второй CLI на тот же транскрипт писал бы в него вдвоём.
    if (run.origin === 'acc' && !isRunFinished(run.state)) return 'runForeign'
    if (!provider) return 'providerMissing'

    const cwd = run.cwd || projectPath

    await desk.hidden.release(run.headConversationId)

    if (cwd !== projectPath) this.options.events.openProject(cwd)

    return (await provider.openChat(cwd, run.headConversationId)) ? null : 'runGone'
  }

  /** Час расписания; провайдера, которого в IDE нет, - отказ, а не час, который каждый раз откажет. */
  schedule(projectPath: string, hour: ScenarioHourRequest) {
    const code = !worksUnattended(hour.provider)
      ? Promise.resolve<ScenarioCode | null>('chatOnly')
      : this.providers.has(hour.provider)
        ? scheduleHour(this.desk(projectPath), hour)
        : Promise.resolve<ScenarioCode | null>('providerMissing')

    return this.afterShelves(projectPath, code)
  }

  unschedule(projectPath: string, scheduleId: string) {
    return this.afterShelves(projectPath, unscheduleHour(this.desk(projectPath), scheduleId))
  }

  /**
   * Машина проснулась: таймеры главного процесса во сне стоят, и граница рабочих часов, прошедшая
   * во сне, иначе ждала бы удара часов до полуминуты - прогон работал бы вне окна.
   */
  awake(): void {
    void this.beat()
  }

  /** Выход из IDE: идущие прогоны останавливаются и дописываются, очереди - тоже. */
  async shutdown(): Promise<void> {
    this.closing = true
    clearInterval(this.clock)
    await this.runner.settle()
    await Promise.all([...this.desks.values()].map((desk) => desk.shutdown()))
    await this.book.settle()
  }

  sendShelves(projectPath: string): void {
    // Полки поменялись (поправили сценарий) - ждущие в очередях пойдут уже по новому: и
    // показывать их так.
    void this.runner.refreshRunsOn()
    void this.shelves
      .view(projectPath)
      .then((view) => this.options.events.onShelves(projectPath, view))
      .catch((error: unknown) => console.warn('[scenarios] полки не собрались:', error))
  }

  /**
   * Книжка скрытых разговоров для папки: worktree, открытый проектом, - это прогоны исходного
   * проекта его очереди, и их разговоры записаны в его книжке, а не в новой пустой.
   */
  private hiddenFor(path: string): Promise<ReadonlySet<string>> {
    const owner = this.book
      .all()
      .find(
        (queue) =>
          queue.workdir.kind === 'worktree' &&
          (queue.workdir.path === path || queue.workdir.projectDir === path),
      )

    return this.desk(owner?.projectPath ?? path).hidden.all()
  }

  private sendQueues(): void {
    this.options.events.onQueues(this.queuesView())
  }

  private async afterShelves(projectPath: string, work: Promise<ScenarioCode | null>) {
    const code = await work

    this.sendShelves(projectPath)

    return code
  }

  /**
   * IDE поднялась: элементы, чьи прогоны оборвались вместе с ней, получают исход, а место у папки
   * проекта, которое после этого не правда, снимается (ADR 0128): иначе Resume в первые секунды,
   * до шага, пустил бы очередь мимо ждущих по старой записи.
   */
  private async recover(): Promise<void> {
    for (const queue of this.book.all()) {
      const running = runningItem(queue)

      if (!running) continue

      const desk = this.desk(queue.projectPath)

      await desk.sweep()

      const record = running.runId ? await desk.runs.read(running.runId) : null

      this.book.put(recoverWithTurn(queue, () => record?.state ?? null, Date.now()))
    }
  }

  private async beat() {
    for (const path of this.open) {
      try {
        if (await tickHours(this.desk(path), this.runner)) this.sendShelves(path)
      } catch (error) {
        console.warn('[scenarios] часы сценариев споткнулись:', error)
      }
    }

    await this.runner.beat()
  }
}
