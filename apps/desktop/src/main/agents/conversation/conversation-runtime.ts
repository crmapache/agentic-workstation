import type {
  Conversation,
  RequestResponse,
  ConversationError,
  ConversationUsage,
  ConversationOptions,
} from '@shared/conversation'
import type {
  NoticeCode,
  StopReason,
  ClosedReason,
  ConversationFeed,
} from '@shared/conversation-feed'

import { syncWork } from '../feed/work-clock'
import type { PanelHooks } from '../hooks/conversation-hooks'
import { turnSummary } from '../hooks/turn-summary'
import type {
  AgentFeed,
  AgentHost,
  AgentShells,
  HeldRequest,
  AgentSession,
  ConnectorsHandle,
} from './agent-parts'
import type { Outgoing } from './outbox'
import { ConversationOutbox } from './outbox'
import { matchesRequest } from './request-match'
import { SessionRecycle } from './session-recycle'

/** Разговор работает: идёт ход (с вопросами к человеку) или фоновые агенты. */
const isWorking = (meta: Conversation): boolean => meta.status !== 'idle' || meta.backgroundWork

/** Чем кончился ход: остановкой, ошибкой и с какими цифрами контекста. */
export type TurnEnd = { interrupted: boolean; isError: boolean; usage: ConversationUsage }

/** Почему сессия кончилась: в ленту строкой, ход закрывается. null - кончилась тихо (сон). */
export type SessionExit = { code: NoticeCode; detail: string } | null

/**
 * Один разговор: его вкладка, лента и сессия CLI провайдера (ADR 0083). Сессия поднимается
 * на первое сообщение и гасится после простоя; вопросы CLI (разрешение, выбор, план) ждут
 * ответа человека без таймеров - CLI ждёт столько же. Отправки и очередь - в outbox.ts.
 * Что делает сессия и как она говорит со своим CLI, ядро не знает - это драйвер.
 */
export class ConversationRuntime {
  readonly feed: AgentFeed
  session: AgentSession | null = null
  /** Аккаунт, на котором поднята сессия: её расход эта сессия и знает. */
  accountId = ''
  held: HeldRequest[] = []
  /** Идёт ход основного разговора (не только фоновые вопросы субагентов). */
  turnActive = false
  /** Откат в пути: сессию не перезапускать, пока CLI не ответил. */
  rewinding = false
  /** Отправки и очередь: правки очереди из поля (вынуть, переставить) идут прямо сюда. */
  readonly outbox: ConversationOutbox
  /** Команды «!»; их вывод уезжает модели с ближайшим сообщением. */
  readonly shells: AgentShells
  /**
   * Коннекторы последней сессии. Сессия кончается раньше разговора (сон, перезапуск), а
   * закрытие вкладки должно сказать коннекторам, что разговора больше нет (end).
   */
  connectors: ConnectorsHandle | null = null
  private opening: Promise<AgentSession | null> | null = null
  /** Перезапуск и сон сессии: когда гасить её, не закрывая разговор. */
  private readonly recycle = new SessionRecycle(this)
  private disposed = false

  constructor(
    public meta: Conversation,
    readonly host: AgentHost,
    /** Хуки расширений IDE (ADR 0091): нет - разговор идёт без них. */
    readonly hooks: PanelHooks | undefined = undefined,
  ) {
    const parts = host.driver.attach(this)

    this.feed = parts.feed
    this.shells = parts.shells
    this.outbox = new ConversationOutbox(this)
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

  /** Прошлые ходы - из журнала провайдера (у Claude - транскрипт, у нерождённого форка - источника). */
  loadFeed(): Promise<void> {
    return this.feed.ensureLoaded()
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
   * кончится словами CLI; вопросы, которые ждали, снимаются. Хода нет - снимаются только
   * вопросы, которые панель держит сама после хода (план Codex), и очередь ждёт человека;
   * вопрос фонового субагента CLI остаётся ждать ответа.
   */
  interrupt(reason: StopReason = 'you'): void {
    const session = this.session

    if (!session?.isAlive) return
    if (!this.turnActive) return this.dropOwnQuestions(session)

    for (const held of this.held) session.dismiss(held)

    this.held = []

    this.feed.builder.noteStopped(reason)
    this.update({ stopRequestedAt: Date.now() })
    this.syncStatus()
    session.interrupt().catch((error: unknown) => {
      console.warn('[agents] остановка хода не принята:', error)
    })
  }

  private dropOwnQuestions(session: AgentSession): void {
    const own = this.held.filter((held) => held.ownAfterTurn)

    if (own.length === 0) return

    for (const held of own) session.dismiss(held)

    this.held = this.held.filter((held) => !held.ownAfterTurn)
    this.syncStatus()
    void this.outbox.afterTurn(false)
  }

  /** CLI не ответил на остановку - погасить сессию. */
  forceStop(): void {
    this.session?.kill()
  }

  /** Ответ человека на вопрос. Ответ не того вида, что вопрос, - ошибка, а не догадка. */
  respond(requestId: string, response: RequestResponse): void {
    const index = this.held.findIndex((held) => held.pending.requestId === requestId)
    const held = this.held[index]

    if (!held || !this.session) return
    if (!matchesRequest(held, response)) throw new Error('Ответ не подходит к вопросу')

    this.held.splice(index, 1)
    this.session.answer(held, response)
    this.syncStatus()
    // Последний вопрос фонового субагента снят после хода - очередь может идти.
    this.applyPendingRestart()
    void this.outbox.drain()
  }

  /** Человек ответил в чат, пока ход стоял на вопросе: вопрос снимается сообщением. */
  answerInChat(held: HeldRequest, message: Outgoing): void {
    const session = this.session

    if (!session) return

    this.held = this.held.filter((entry) => entry !== held)
    session.answerInChat(held, message)
    this.syncStatus()
  }

  /** Модель, усилие, режим. Живой сессии - без перезапуска, словами её CLI. */
  setOptions(options: ConversationOptions): void {
    this.host.driver.setOptions(this, options)
  }

  /** Причина, по которой разговор стоял, снята: убрать её и отправить то, что ждало. */
  resolveError(error: ConversationError): Promise<void> {
    if (this.meta.error !== error) return Promise.resolve()

    this.update({ error: null })

    return this.outbox.release()
  }

  /** Сессия гасится (человек нажал «погасить») - дождаться, пока она закроется. */
  async settleStopping(): Promise<void> {
    if (this.session?.isStopping) await this.session.stop()
  }

  /**
   * Закрыть вкладку: сессия гасится, начатый подъём не доведётся. Коннекторы узнают, что
   * разговора больше нет: его вкладки браузера закрываются сразу, а не ждут новую сессию.
   */
  dispose(): Promise<void> {
    this.disposed = true
    this.shells.stopAll()
    this.recycle.clearIdleTimer()
    this.feed.dispose()
    this.connectors?.end()

    const session = this.session

    this.session = null

    return session ? session.stop() : Promise.resolve()
  }

  /**
   * Поменять поля вкладки и сообщить сервису. Работа встала - коннекторы сразу убирают то, чем
   * показывали её человеку: иначе курсор и рамка агента в Chrome стояли бы на странице до
   * закрытия вкладки разговора, а капсула Computer - минуту.
   */
  update(change: Partial<Conversation>): void {
    const wasWorking = isWorking(this.meta)

    this.meta = { ...this.meta, ...change, updatedAt: Date.now() }
    this.host.onChange()

    if (wasWorking && !isWorking(this.meta)) this.connectors?.idle()
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

  /**
   * Сессия кончилась (процесс вышел). Чужая (заменённая) уже не наша - её выход ничего не
   * трогает. exit - почему, если ход оборвался; null - кончилась тихо.
   */
  sessionEnded(session: AgentSession, exit: SessionExit): void {
    if (session !== this.session) return

    this.session = null
    this.recycle.clearIdleTimer()

    if (exit) this.feed.builder.abortTurn(exit.code, exit.detail)
    else this.feed.builder.abortBackground()

    this.feed.flush()
    this.held = []
    this.turnActive = false
    // Сессия умерла посреди хода или не поднялась - вкладка говорит об этом красной точкой.
    const crashed = exit !== null && exit.code !== 'interrupted'

    this.update({
      turnStartedAt: null,
      stopRequestedAt: null,
      ...(crashed && { outcome: 'crashed' }),
      ...(exit?.code === 'interrupted' && { outcome: 'interrupted' }),
    })
    this.syncStatus()

    if (crashed) this.host.onCall(this.meta.id, 'error')

    // Ход оборвался вместе с сессией - очередь ждёт человека, как после «стоп».
    if (exit) void this.outbox.afterTurn(false)
  }

  /**
   * Ход кончился словами CLI (у Claude - `result`, у Codex - `turn/completed`): лента
   * дописана, вкладка свободна, цифры контекста и исход. Вопросы фоновых субагентов
   * переживают конец хода: CLI ждёт на них ответа. Очередь и сон драйвер запускает сам
   * (afterTurn) - после того, что ему нужно спросить у ещё живой сессии.
   */
  settleTurn(end: TurnEnd): void {
    const outcome = end.isError ? 'error' : end.interrupted ? 'interrupted' : 'done'

    this.feed.flush()
    this.turnActive = false
    this.update({ turnStartedAt: null, stopRequestedAt: null, usage: end.usage, outcome })
    this.syncStatus()
    this.hooks?.turnEnded({
      conversationId: this.meta.id,
      projectPath: this.meta.projectPath,
      outcome,
      ...turnSummary(this.feed.builder.items),
    })
  }

  /**
   * Вопрос CLI к человеку встаёт во вкладку и зовёт его. Разрешение сначала видят охраны
   * расширений (ADR 0091): отказ - сразу ответ CLI с их причиной, человек вопроса не видит.
   * Охран нет - вопрос встаёт сразу, как всегда.
   */
  async hold(held: HeldRequest): Promise<void> {
    const { pending } = held
    const session = this.session
    const { hooks } = this

    if (pending.kind === 'permission' && session && hooks?.guarding()) {
      const reason = await hooks
        .guard({
          conversationId: this.meta.id,
          projectPath: this.meta.projectPath,
          toolName: pending.toolName,
          action: pending.action,
          input: pending.input,
          description: pending.description,
        })
        .catch(() => null)

      if (this.isDisposed || this.session !== session) return
      if (reason !== null) {
        return session.answer(held, {
          kind: 'permission',
          decision: { behavior: 'deny', message: reason },
        })
      }
    }

    this.held = [...this.held, held]
    this.syncStatus()
    // Вид вопроса и есть повод позвать: разрешение, выбор, план.
    this.host.onCall(this.meta.id, pending.kind)
  }

  /**
   * Ход кончился. Чистый - очередь идёт дальше; остановленный или с ошибкой - очередь
   * ждёт человека: слать дальше в ошибку или после «стоп» незачем. И отсчёт до сна
   * сессии: новый ход его снимет.
   */
  afterTurn(isClean: boolean): void {
    this.applyPendingRestart()
    void this.outbox.afterTurn(isClean)
    this.scheduleSleep()
  }

  /**
   * Папка доверена, лента прочитана, сессия поднята - или null и причина во вкладке.
   * Гасимая сессия сначала доживает: её выход ещё должен снять ход и вопросы. Живая,
   * но ждущая перезапуска, - сменяется, если разговор свободен.
   */
  async prepareSession(): Promise<AgentSession | null> {
    if (!(await this.host.isTrusted(this.meta.projectPath))) {
      this.update({ error: 'untrusted' })

      return null
    }

    await this.loadFeed()
    await this.settleStopping()
    this.recycle.clearIdleTimer()
    this.applyPendingRestart()

    if (this.session?.isAlive) return this.session

    this.opening ??= this.openSession().finally(() => {
      this.opening = null
    })

    return this.opening
  }

  private async openSession(): Promise<AgentSession | null> {
    const accountId = this.host.accountId()
    // Сбой подготовки (файловая система, CLI) - причина во вкладке, а не повисший ход.
    const session = await this.host.driver.open(this).catch((error: unknown) => {
      console.warn('[agents] сессия разговора не поднялась', error)
      this.update({ error: 'start-failed' })

      return null
    })

    if (!session || this.disposed) {
      if (session) void session.stop()

      return null
    }

    this.accountId = accountId
    this.session = session
    this.update({ error: null })

    return session
  }

  /**
   * Конфиг MCP или аккаунт поменялся, а CLI читает их только на старте: сессия гасится,
   * как только свободна, и поднимется заново, продолжив разговор (session-recycle.ts).
   */
  restartSession(): void {
    this.recycle.restart()
  }

  /** Перезапуск, который ждал свободы: зовут везде, где разговор освобождается, и перед ходом. */
  applyPendingRestart(): void {
    this.recycle.applyPending()
  }

  /** Погасить сессию сейчас, не дожидаясь фона (переезд на другой аккаунт). */
  stopNow(reason: ClosedReason): Promise<void> {
    return this.recycle.stopNow(reason)
  }

  /** Сон сессии после простоя - если ничего не идёт, в том числе в фоне. */
  scheduleSleep(): void {
    this.recycle.scheduleSleep()
  }
}
