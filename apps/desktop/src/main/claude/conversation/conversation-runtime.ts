import type {
  ModelInfo,
  Conversation,
  SlashCommand,
  ImageAttachment,
  RequestResponse,
  ConversationError,
  ConversationOptions,
} from '@shared/claude'
import type { FeedPatch, StopReason, ConversationFeed } from '@shared/claude-feed'
import type { SoundEvent } from '@shared/sounds'

import { TurnRevert } from '../changes/turn-revert'
import type { ClaudeCli } from '../cli/cli-locator'
import type { CliTap, CliMessage, ControlRequest } from '../cli/cli-messages'
import type { CliProcess } from '../cli/cli-process'
import { syncWork } from '../feed/work-clock'
import { ShellRuns } from '../shell/shell-runs'
import { takeControlRequest } from './control-requests'
import { ConversationFeedSync } from './conversation-feed'
import { IDLE_SLEEP_MS } from './conversation.constants'
import { exitNotice } from './exit-notice'
import { applyOptions } from './options'
import type { Outgoing } from './outbox'
import { ConversationOutbox } from './outbox'
import type { HeldRequest } from './pending-requests'
import { answerFor, matchesRequest, modeFromAlways } from './pending-requests'
import { routeMessage } from './process-router'
import { spawnConversationProcess } from './spawn'

/**
 * Конфиг коннекторов IDE для одного процесса разговора (ADR 0029): файл для
 * `--mcp-config`; own - чей это процесс (разговор и его папка), release - процесс кончился
 * (ключ шлюза и процессы команд гаснут, сессия браузера ждёт следующий процесс разговора),
 * end - разговор закрыт насовсем (вкладки браузера закрываются сразу).
 */
export type ConnectorsLaunch = {
  path: string
  own: (owner: { conversationId: string; workDir: string }) => void
  release: () => void
  end: () => void
}

/** Что разговору нужно от сервиса: CLI, доверие к папке и куда сообщать об изменениях. */
export type ConversationHost = CliTap & {
  cli: () => Promise<ClaudeCli | null>
  isTrusted: (projectPath: string) => Promise<boolean>
  onChange: () => void
  onFeedPatch: (patch: FeedPatch) => void
  onCommands: (projectPath: string, commands: SlashCommand[]) => void
  onModels: (models: ModelInfo[]) => void
  knownCommands: (projectPath: string) => SlashCommand[]
  /** Миниатюра картинки сообщения для ленты (data URL) - делает Electron. */
  thumbnail: (image: ImageAttachment) => string
  /** Аккаунт, на котором сейчас поднимаются процессы разговоров. */
  accountId: () => string
  /** Ход кончился или CLI сказал о лимите: процесс знает свежий расход аккаунта. */
  onUsageHint: (runtime: ConversationRuntime) => void
  /**
   * Разговор позвал человека: вопрос, конец хода, лимит, поломка (звук и свечение
   * вкладки). key - у повода, который CLI повторяет (лимит того же окна): зовёт раз.
   */
  onCall: (conversationId: string, reason: SoundEvent, key?: string) => void
  /**
   * Конфиг коннекторов IDE для нового процесса в проекте (ADR 0029); коннекторов нет -
   * null. Не записался - отказ: процесс поднимется без них.
   */
  mcpConfig: (projectPath: string) => Promise<ConnectorsLaunch | null>
}

/**
 * Один разговор: его вкладка, лента и процесс CLI. Процесс поднимается на первое
 * сообщение и гасится после простоя; вопросы CLI (разрешение, выбор, план) ждут ответа
 * человека без таймеров - CLI ждёт столько же. Отправки и очередь - в outbox.ts.
 */
export class ConversationRuntime {
  readonly feed: ConversationFeedSync
  /** Откат файлов последнего хода; конец хода запоминает process-router. */
  readonly turnRevert: TurnRevert
  process: CliProcess | null = null
  cli: ClaudeCli | null = null
  /** Аккаунт, на котором поднят процесс: его расход этот процесс и знает. */
  accountId = ''
  held: HeldRequest[] = []
  /** Идёт ход основного разговора (не только фоновые вопросы субагентов). */
  turnActive = false
  /**
   * Процесс только поднят: его первый пустой `result` (после --resume), не привязанный к
   * нашему сообщению, - не ход (turn-command.ts). Снимается, как только CLI взял сообщение.
   */
  freshProcess = false
  /**
   * uuid нашего сообщения, которым начался идущий ход: по отметкам CLI о нём видно, кончился
   * ли ход (turn-command.ts). null - ход начал сам CLI.
   */
  turnCommand: string | null = null
  /** Ждём от CLI имя вкладки (conversation/session-title.ts): второй раз не спрашиваем. */
  titleAsking = false
  /** Счёт /clear: имя, пришедшее после него, было о прежнем разговоре. */
  titleEpoch = 0
  /** Имя от человека, которое уже получил этот процесс (tabs/tab-rename.ts). */
  namedAs: string | null = null
  /** Имя последнего сообщения, ушедшего в CLI: откат говорит его как последнее увиденное. */
  lastSentUuid: string | null = null
  /**
   * Ход отрезан откатом: CLI про него молчит, а то, что всё же пришло (поздний
   * `result`, хвост ответа), - лишнее. Снимается следующим сообщением человека.
   */
  discardStray = false
  /** Откат в пути: процесс не перезапускать, пока CLI не ответил (rewind.ts). */
  rewinding = false
  /** Отправки и очередь: правки очереди из поля (вынуть, переставить) идут прямо сюда. */
  readonly outbox: ConversationOutbox
  /** Команды «!»; их вывод уезжает модели с ближайшим сообщением (user-message.ts). */
  readonly shells: ShellRuns
  /**
   * Коннекторы последнего процесса. Процесс кончается раньше разговора (сон, перезапуск), а
   * закрытие вкладки должно сказать коннекторам, что разговора больше нет (end).
   */
  connectors: ConnectorsLaunch | null = null
  private spawning: Promise<CliProcess | null> | null = null
  /** Конфиг MCP или аккаунт поменялся: процесс перезапустится, как только освободится. */
  private restartPending = false
  private idleTimer: NodeJS.Timeout | null = null
  private disposed = false

  constructor(
    public meta: Conversation,
    readonly host: ConversationHost,
  ) {
    this.feed = new ConversationFeedSync(meta.id, host.onFeedPatch, host.thumbnail)
    this.outbox = new ConversationOutbox(this)
    this.shells = new ShellRuns(this.feed)
    this.turnRevert = new TurnRevert(this)
  }

  /** Нет хода и вопросов к человеку: можно начинать новый ход. */
  get isFree(): boolean {
    return !this.turnActive && this.held.length === 0
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  async getFeed(): Promise<ConversationFeed> {
    await this.loadFeed()

    return this.feed.snapshot()
  }

  /** Прошлые ходы - из своего транскрипта, у нерождённого форка - из источника. */
  loadFeed(): Promise<void> {
    return this.feed.ensureLoaded(this.meta.projectPath, this.meta.sessionId, this.meta.fork)
  }

  /** Сообщение человека. Отправки идут строго по одной, в порядке нажатия. */
  send(message: Outgoing): Promise<void> {
    return this.outbox.send(message)
  }

  /** Отложить сообщение до конца хода; before - перед каким соседом встать. */
  enqueue(message: Outgoing, before: string | null = null): Promise<void> {
    return this.outbox.enqueue(message, before)
  }

  removeQueued(queuedId: string): void {
    this.outbox.remove(queuedId)
  }

  /** Команда «!» в папке проекта: выполняет панель, модель увидит её со следующим сообщением. */
  runShell(command: string): Promise<void> {
    return this.shells.run(command, this.meta.projectPath)
  }

  stopShell(runId: string): void {
    this.shells.stop(runId)
  }

  /** Откат: очередь, стоявшая в момент нажатия, написана про отрезанное и уходит с ним. */
  dropQueued(queuedIds: readonly string[]): void {
    this.outbox.removeAll(queuedIds)
  }

  sendQueued(queuedId: string): Promise<void> {
    return this.outbox.sendQueued(queuedId)
  }

  /**
   * Остановить ход - человек или панель ради переезда на аккаунт (подпись итога). Ход
   * кончится по `result`; вопросы, которые ждали, снимаются.
   */
  interrupt(reason: StopReason = 'you'): void {
    if (!this.process?.isAlive || !this.turnActive) return

    for (const held of this.held) {
      this.process.respond(held.pending.requestId, {
        behavior: 'deny',
        message: 'The user stopped the turn.',
      })
    }

    this.held = []
    this.feed.builder.noteStopped(reason)
    this.update({ stopRequestedAt: Date.now() })
    this.syncStatus()
    this.process.control({ subtype: 'interrupt' }).catch((error: unknown) => {
      console.warn('[claude] interrupt не принят:', error)
    })
  }

  /** CLI не ответил на остановку - погасить процесс. */
  forceStop(): void {
    this.process?.kill()
  }

  /** Ответ человека на вопрос. Ответ не того вида, что вопрос, - ошибка, а не догадка. */
  respond(requestId: string, response: RequestResponse): void {
    const index = this.held.findIndex((held) => held.pending.requestId === requestId)
    const held = this.held[index]

    if (!held || !this.process) return
    if (!matchesRequest(held, response)) throw new Error('Ответ не подходит к вопросу')

    this.held.splice(index, 1)
    this.process.respond(requestId, answerFor(held, response))

    const isAlways = response.kind === 'permission' && response.decision.behavior === 'allowAlways'
    const mode = isAlways ? modeFromAlways(held) : null

    if (mode === 'acceptEdits' || mode === 'plan' || mode === 'bypassPermissions') {
      this.update({ permissionMode: mode })
    }

    if (response.kind === 'plan' && response.approved) {
      this.setOptions({ permissionMode: response.acceptEdits ? 'acceptEdits' : 'default' })
    }

    this.syncStatus()
    // Последний вопрос фонового субагента снят после хода - очередь может идти.
    this.applyPendingRestart()
    void this.outbox.drain()
  }

  /** Модель, усилие, режим. Живому процессу - управляющими запросами, без перезапуска. */
  setOptions(options: ConversationOptions): void {
    applyOptions(this, options)
  }

  /** Причина, по которой разговор стоял, снята: убрать её и отправить то, что ждало. */
  resolveError(error: ConversationError): Promise<void> {
    if (this.meta.error !== error) return Promise.resolve()

    this.update({ error: null })

    return this.outbox.release()
  }

  /** Процесс гасится (человек нажал «погасить») - дождаться, пока он закроется. */
  async settleStopping(): Promise<void> {
    if (this.process?.isStopping) await this.process.stop()
  }

  /**
   * Закрыть вкладку: процесс гасится, начатый запуск не доведётся. Коннекторы узнают, что
   * разговора больше нет: его вкладки браузера закрываются сразу, а не ждут новый процесс.
   */
  dispose(): Promise<void> {
    this.disposed = true
    this.shells.stopAll()
    this.clearIdleTimer()
    this.feed.dispose()
    this.connectors?.end()

    const process = this.process

    this.process = null

    return process ? process.stop() : Promise.resolve()
  }

  /** Поменять поля вкладки и сообщить сервису. */
  update(change: Partial<Conversation>): void {
    this.meta = { ...this.meta, ...change, updatedAt: Date.now() }
    this.host.onChange()
  }

  /**
   * Статус из двух вещей: ждут ли ответа вопросы и идёт ли основной ход. Новый ход
   * снимает прошлую остановку, ошибку и поломку: точка вкладки говорит о том, что идёт сейчас.
   */
  syncStatus(): void {
    const [first] = this.held
    const status = first ? 'waiting' : this.turnActive ? 'running' : 'idle'
    const { outcome } = this.meta
    const settled = outcome === 'error' || outcome === 'crashed' || outcome === 'interrupted'
    const { builder } = this.feed

    this.update({
      pending: first?.pending ?? null,
      pendingCount: this.held.length,
      status,
      outcome: this.turnActive && settled ? 'done' : outcome,
      backgroundWork: builder.hasBackgroundWork,
      // Счётчик работы для строки статуса: паузы на вопросах, конец, когда всё встало.
      ...syncWork(builder.work, status, builder.hasBackgroundWork, Date.now()),
    })
  }

  handleMessage(process: CliProcess, message: CliMessage): void {
    if (process === this.process) routeMessage(this, message)
  }

  handleControlRequest(process: CliProcess, request: ControlRequest): void {
    if (process === this.process) takeControlRequest(this, process, request)
  }

  handleExit(process: CliProcess, code: number | null, stderrTail: string): void {
    if (process !== this.process) return

    const notice = exitNotice(this, code, stderrTail)

    this.process = null
    this.clearIdleTimer()

    if (notice) this.feed.builder.abortTurn(notice.code, notice.detail)
    else this.feed.builder.abortBackground()

    this.feed.flush()
    this.held = []
    this.turnActive = false
    this.freshProcess = false
    // Процесс умер посреди хода или не поднялся - вкладка говорит об этом красной точкой.
    const crashed = notice !== null && notice.code !== 'interrupted'

    this.update({
      turnStartedAt: null,
      stopRequestedAt: null,
      ...(crashed && { outcome: 'crashed' }),
      ...(notice?.code === 'interrupted' && { outcome: 'interrupted' }),
    })
    this.syncStatus()

    if (crashed) this.host.onCall(this.meta.id, 'error')

    // Ход оборвался вместе с процессом - очередь ждёт человека, как после «стоп».
    if (notice) void this.outbox.afterTurn(false)
  }

  /**
   * Ход кончился. Чистый - очередь идёт дальше; остановленный или с ошибкой - очередь
   * ждёт человека: слать дальше в ошибку или после «стоп» незачем. И отсчёт до сна
   * процесса: новый ход его снимет.
   */
  afterTurn(isClean: boolean): void {
    this.applyPendingRestart()
    void this.outbox.afterTurn(isClean)
    this.scheduleSleep()
  }

  /**
   * Папка доверена, лента прочитана, процесс поднят - или null и причина во вкладке.
   * Гасимый процесс сначала доживает: его выход ещё должен снять ход и вопросы. Живой,
   * но ждущий перезапуска, - сменяется, если разговор свободен.
   */
  async prepareProcess(): Promise<CliProcess | null> {
    if (!(await this.host.isTrusted(this.meta.projectPath))) {
      this.update({ error: 'untrusted' })

      return null
    }

    await this.loadFeed()
    await this.settleStopping()
    this.clearIdleTimer()
    this.applyPendingRestart()

    if (this.process?.isAlive) return this.process

    this.spawning ??= this.spawnProcess().finally(() => {
      this.spawning = null
    })

    return this.spawning
  }

  private async spawnProcess(): Promise<CliProcess | null> {
    const accountId = this.host.accountId()
    const cli = await this.host.cli()

    if (!cli) {
      this.update({ error: 'cli-not-found' })

      return null
    }

    // Сбой подготовки (файловая система, CLI) - причина во вкладке, а не повисший ход.
    const process = await spawnConversationProcess(this, cli).catch((error: unknown) => {
      console.warn('[claude] процесс разговора не поднялся', error)
      this.update({ error: 'start-failed' })

      return null
    })

    if (!process || this.disposed) {
      if (process) void process.stop()

      return null
    }

    this.cli = cli
    this.accountId = accountId
    this.process = process
    this.freshProcess = true
    this.namedAs = null
    this.feed.builder.startProcess()
    this.update({ error: null })

    return process
  }

  /**
   * Конфиг MCP или аккаунт поменялся, а CLI читает их только на старте: процесс гасится,
   * как только свободен (ход, вопросы, фоновые субагенты и откат не рвутся), и
   * поднимется заново с --resume.
   */
  restartProcess(): void {
    this.restartPending = true
    this.applyPendingRestart()
  }

  /**
   * Перезапуск, который ждал свободы. Зовут везде, где разговор освобождается, и перед
   * новым ходом: иначе ход ушёл бы в старый процесс - на прежнем аккаунте.
   */
  applyPendingRestart(): void {
    const isBusy = !this.isFree || this.rewinding || this.feed.builder.hasBackgroundWork

    if (!this.restartPending || isBusy) return

    const process = this.process

    this.restartPending = false
    this.process = null

    // Выход заменённого процесса сюда уже не дойдёт (он больше не наш): фоновые команды
    // отпускаются здесь, иначе их учёт держал бы следующий процесс без сна навсегда.
    if (process) {
      this.feed.builder.abortBackground('restarted')
      this.feed.flush()
    }

    void process?.stop()
  }

  /**
   * Сон процесса после простоя. Фоновые агенты, флот workflow и фоновые команды - работа
   * этого процесса: вкладка выглядит простаивающей, а сон убил бы их молча.
   */
  scheduleSleep(): void {
    this.clearIdleTimer()
    this.idleTimer = setTimeout(() => {
      // Очередь, которая ждёт человека, - не работа: процесс может уснуть.
      const hasOutgoing = this.meta.queue.length > 0 && !this.outbox.isHeld
      const isBusy = !this.isFree || hasOutgoing || this.feed.builder.hasBackgroundWork

      if (isBusy || this.feed.builder.hasBackgroundCommands) return this.scheduleSleep()

      const process = this.process

      this.process = null
      void process?.stop()
    }, IDLE_SLEEP_MS)
    this.idleTimer.unref()
  }

  private clearIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer)

    this.idleTimer = null
  }
}
