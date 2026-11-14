import type { ImageAttachment } from '@shared/claude'
import type {
  FeedItem,
  TaskEntry,
  FileChange,
  NoticeCode,
  StopReason,
  NoticeExtra,
  ClosedReason,
  ToolFeedItem,
  UserFeedItem,
  ShellFeedItem,
} from '@shared/claude-feed'

import type { CliMessage } from '../cli/cli-messages'
import { isRecord, numberField, recordField, stringField } from '../cli/cli-messages'
import { AgentTasks } from './agent-tasks'
import { AssistantBlocks } from './assistant-blocks'
import { FeedStore } from './feed-store'
import { lineTime } from './line-time'
import { leftQuestion, replayedUser, assistantText, replayedQueued } from './replayed-user'
import { ServiceRows } from './service-rows'
import { TaskList } from './task-list'
import { ToolResults } from './tool-results'
import { TurnCloser } from './turn-closer'
import { TurnTracker } from './turn-tracker'
import { WorkClock } from './work-clock'

/** Что ушло окну с прошлого сбора: тронутые и убранные элементы, список задач, если менялся. */
export type FeedChanges = {
  upserts: FeedItem[]
  removes: string[]
  tasks?: TaskEntry[] | undefined
}

/** Шов форка: строка источника, до которой форк его несёт, имя и сессия источника. */
export type ForkSeam = { at: string; title: string; sourceSessionId: string; whole: boolean }

const parentOf = (message: CliMessage) => {
  const parent = message['parent_tool_use_id']

  return typeof parent === 'string' && parent ? parent : null
}

/** Модель настоящая, а не служебная метка CLI («<synthetic>» у прерванного ответа). */
const realModel = (model: string) => (model && !model.startsWith('<') ? model : '')

/**
 * Лента разговора из строк CLI - живого потока или транскрипта (replay). Чистая
 * логика без процессов и Electron: что пришло - то и легло в ленту, окну уходят
 * только тронутые элементы (drain).
 */
export class FeedBuilder {
  private readonly store = new FeedStore()
  private readonly taskList = new TaskList()
  private readonly blocks = new AssistantBlocks(this.store)
  /** Ходы: начало текущего, последний итог с файлами хода. */
  private readonly turns = new TurnTracker(this.store)
  /** Субагенты, флоты и фоновые команды (task_*): ждут уведомления, а не конца хода. */
  private readonly agents = new AgentTasks(this.store)
  private readonly results = new ToolResults(this.store, this.taskList, this.agents)
  private readonly service = new ServiceRows({
    store: this.store,
    nextId: (prefix) => this.nextId(prefix),
    addNotice: (code, detail) => this.addNotice(code, detail),
  })
  /** Время всего запроса человека - для подписи «Worked» и строки статуса. */
  readonly work = new WorkClock()
  /** Конец хода: итог, цена, подпись остановки, закрытие незаконченного. */
  private readonly closer = new TurnCloser({
    store: this.store,
    blocks: this.blocks,
    agents: this.agents,
    service: this.service,
    turns: this.turns,
    work: this.work,
    now: () => this.now(),
    nextId: (prefix) => this.nextId(prefix),
    addNotice: (code, detail, extra) => this.addNotice(code, detail, extra),
  })
  /** Список задач до каждого сообщения человека: откат к сообщению возвращает его. */
  private readonly tasksBefore = new Map<string, TaskEntry[]>()
  private tasksChanged = false
  private sequence = 0
  /** Идёт разбор транскрипта: отметки из него - записи прошлого, а не события. */
  private replaying = false
  /** Модель, которой отвечал основной поток в последний раз. */
  private lastModel = ''
  /** Вопрос, на котором оборвался прочитанный разговор (ни ответа, ни строки после). */
  private abandoned: ToolFeedItem | null = null

  /**
   * thumbnail - миниатюра картинки сообщения (data URL); делает её главный процесс
   * (Electron), сборщик о нём не знает. Без неё у картинки в ленте пустая миниатюра.
   * now - часы (в тестах свои).
   */
  constructor(
    private readonly thumbnail: (image: ImageAttachment) => string = () => '',
    private readonly now: () => number = Date.now,
  ) {}

  get items(): readonly FeedItem[] {
    return this.store.items
  }

  get tasks(): TaskEntry[] {
    return this.taskList.tasks
  }

  /**
   * Что известно из прочитанного транскрипта: модель последнего ответа основного потока
   * (вкладке из истории) и вопрос, на котором разговор оборвался (null - такого нет).
   */
  get replayFacts(): { model: string; abandonedQuestion: ToolFeedItem | null } {
    return { model: this.lastModel, abandonedQuestion: this.abandoned }
  }

  /** Строка CLI. replay - строка транскрипта: сообщения человека берутся из неё. */
  apply(message: CliMessage, replay = false): void {
    const at = lineTime(message, this.now())

    this.replaying = replay

    if (!replay) this.service.closeRetryFor(message, at)

    if (message.type === 'stream_event' && parentOf(message) === null) {
      this.blocks.applyStreamEvent(recordField(message, 'event'), at)
    } else if (message.type === 'assistant') {
      this.applyAssistant(message, at)
    } else if (message.type === 'user') {
      this.applyUser(message, replay, at)
    } else if (message.type === 'attachment' && replay) {
      this.applyQueuedPrompt(message, at)
    } else if (message.type === 'system') {
      this.applySystem(message, at)
    } else if (message.type === 'rate_limit_event' && !replay) {
      this.service.applyRateLimit(message, at)
    } else if (message.type === 'conversation_reset') {
      this.resetConversation()
    }

    this.replaying = false
  }

  /** Сообщение, которое человек отправил из окна. steering - посреди хода. */
  addUserMessage(
    id: string,
    text: string,
    images: ImageAttachment[],
    steering: boolean,
    extra: Pick<UserFeedItem, 'draft' | 'editor' | 'auto'> = {},
  ): void {
    const time = this.now()

    if (!steering) this.work.begin(time)

    this.turns.begin(id, steering)
    this.tasksBefore.set(id, this.taskList.tasks)
    this.store.put({
      kind: 'user',
      id,
      parentToolUseId: null,
      text,
      time,
      images: this.thumbnails(images),
      steering,
      ...extra,
    })
  }

  /**
   * Откат разговора: сообщение и всё после него уходит, список задач - каким был до
   * него. Незаконченное в отрезанном больше не допишется: CLI про тот ход молчит.
   * keep - карточки, которые остаются (команды «!», которых модель не видела).
   */
  truncateFrom(id: string, keep: ReadonlySet<string> = new Set()): void {
    this.blocks.closeStreaming()
    this.service.reset()
    this.store.removeFrom(id, keep)

    this.turns.afterTruncate()
    this.taskList.restore(this.tasksBefore.get(id) ?? [])
    this.tasksChanged = true
    this.agents.prune()
  }

  /** Команда «!» - новая или по ходу своего вывода. */
  putShell(item: ShellFeedItem): void {
    this.store.put(item)
  }

  addNotice(code: NoticeCode, detail = '', extra: NoticeExtra = {}): void {
    this.store.put({
      kind: 'notice',
      id: this.nextId('notice'),
      parentToolUseId: null,
      code,
      detail,
      replayed: this.replaying,
      ...extra,
    })
  }

  /** Конец хода по `result` (turn-closer.ts). interrupted - ход останавливали. */
  finishTurn(result: CliMessage, interrupted: boolean): void {
    this.closer.finish(result, interrupted)
  }

  /** Ход кончился без `result` (turn-closer.ts): незаконченное закрыто, итога нет. */
  closeTurnWithoutResult(interrupted: boolean): void {
    this.closer.close(interrupted)
  }

  /** Поднят новый процесс CLI: цена хода считается от его нуля, а не от итога прошлого. */
  startProcess(): void {
    this.closer.startProcess()
  }

  /**
   * Работа не встала: идут фоновые субагенты, флоты workflow, агенты скилла (без фоновых
   * команд - они не отчитываются). Процесс не усыпляется, подпись «Worked» ждёт.
   */
  get hasBackgroundWork(): boolean {
    return this.agents.hasWork
  }

  /** Идут фоновые команды Bash: дети процесса CLI, его сон убил бы их молча. */
  get hasBackgroundCommands(): boolean {
    return this.agents.hasCommands
  }

  /**
   * Процесс ушёл между ходами: фоновые субагенты умерли вместе с ним, за командами
   * следить некому. reason - почему: умер сам или заменён нарочно (аккаунт, MCP).
   */
  abortBackground(reason: ClosedReason = 'exited'): void {
    this.agents.release(reason, this.now())
  }

  /** Ход оборвался без `result` (процесс умер): незаконченное помечается прерванным. */
  abortTurn(code: NoticeCode, detail: string): void {
    this.closer.abort(code, detail)
  }

  /**
   * Ход остановлен - человеком или ради переезда на другой аккаунт (подпись итога):
   * повторы запроса, если шли, кончились остановкой.
   */
  noteStopped(reason: StopReason = 'you'): void {
    this.closer.stopped(reason)
  }

  /**
   * Быстрый режим попросили заново: отказ по той же причине - снова новость, строка FAST
   * встанет ещё раз (как в ACC), а не один раз на жизнь ленты.
   */
  noteFastAsked(): void {
    this.service.fastAsked()
  }

  /** Поднятый процесс: настройки репозитория перебивают выбранный аккаунт (строка SETTINGS). */
  noteOutranked(names: readonly string[]): void {
    this.service.noteOutranked(names)
  }

  /**
   * Транскрипт прочитан. Фоновые агенты, о конце которых транскрипт молчит (уведомления
   * в нём не нашлось), закрываются с причиной replay, как и остальное незаконченное.
   * Вопрос, на котором разговор оборвался, запоминается: он оживает над полем.
   */
  finishReplay(): void {
    this.agents.forget()
    this.abandoned = leftQuestion(this.store.items)
    this.closer.closeOpenWork('replay', true, this.now())
  }

  /**
   * Страница ранней истории: строки транскрипта выше загруженного встают перед лентой.
   * Результаты их вызовов, прочитанные раньше (ниже границы), достаются им.
   */
  prependReplay(messages: readonly CliMessage[], seam: ForkSeam | null = null): void {
    const page = new FeedBuilder(this.thumbnail, this.now)

    for (const message of messages) {
      page.apply(message, true)

      // Шов форка попал на эту страницу: выше него - унаследованное.
      if (seam && stringField(message, 'uuid') === seam.at) {
        page.addNotice('forked', seam.title, { sourceSessionId: seam.sourceSessionId })
        if (seam.whole) page.addNotice('fork-whole')
      }
    }

    page.results.adopt(this.results)
    page.agents.forget()
    page.closer.closeOpenWork('replay', true, this.now())
    page.results.handOver(this.results)
    this.store.prepend(page.items)
  }

  /** Последний итог хода и сообщение, которым ход начат: откат файлов идёт к нему. */
  get latestTurn(): { id: string; messageId: string } | null {
    return this.turns.latest
  }

  /** Поменять строки файлов в итоге хода (откат, возврат, отказ). */
  updateChanges(turnId: string, change: (changes: FileChange[]) => FileChange[]): void {
    this.turns.updateChanges(turnId, change)
  }

  /** Тронутые с прошлого вызова элементы - окну. */
  drain(): FeedChanges {
    const upserts = this.store.drainTouched()
    const removes = this.store.drainRemoved()
    const tasks = this.tasksChanged ? this.taskList.tasks : undefined

    this.tasksChanged = false

    return { upserts, removes, tasks }
  }

  private applyAssistant(message: CliMessage, at: number) {
    const body = recordField(message, 'message')
    const error = stringField(message, 'error')
    const parent = parentOf(message)

    if (error === 'authentication_failed' || error === 'rate_limit') {
      return this.addNotice(
        error === 'rate_limit' ? 'rate-limited' : 'not-logged-in',
        assistantText(body),
      )
    }

    if (parent === null) this.lastModel = realModel(stringField(body, 'model')) || this.lastModel

    this.blocks.applyMessage(body, parent, at)

    if (parent !== null || !Array.isArray(body['content'])) return

    for (const block of body['content'].filter(isRecord)) {
      if (block['type'] !== 'tool_use') continue

      const changed = this.taskList.applyToolUse(
        stringField(block, 'id'),
        stringField(block, 'name'),
        recordField(block, 'input'),
      )

      this.tasksChanged ||= changed
    }
  }

  private applyUser(message: CliMessage, replay: boolean, at: number) {
    const content = recordField(message, 'message')['content']
    const blocks = Array.isArray(content) ? content.filter(isRecord) : []
    const results = blocks.filter((block) => block['type'] === 'tool_result')

    if (results.length > 0) {
      const changed = this.results.apply(message, results, at)

      this.tasksChanged ||= changed

      return
    }

    if (!replay) return

    this.agents.applyReplayedNotification(recordField(message, 'message')['content'], at)

    const replayed = replayedUser(
      message,
      at,
      (images) => this.thumbnails(images),
      () => this.nextId('user'),
    )

    if (replayed?.kind === 'interrupted') return this.addNotice('interrupted')

    for (const item of replayed?.items ?? []) this.store.put(item)

    if (replayed?.messageId) this.tasksBefore.set(replayed.messageId, this.taskList.tasks)
  }

  /** Написанное посреди хода из транскрипта; живое лента держит с отправки. */
  private applyQueuedPrompt(message: CliMessage, at: number) {
    const queued = replayedQueued(message, at, (images) => this.thumbnails(images))

    for (const item of queued?.items ?? []) this.store.put(item)
  }

  private applySystem(message: CliMessage, at: number) {
    if (this.service.applySystem(message, at)) return

    const isMainInit = message.subtype === 'init' && message['task_id'] === undefined

    if (isMainInit && !this.replaying) {
      // Ход, поднятый без нашего сообщения (отчитался фоновый агент), - тоже работа.
      this.work.begin(at)
      this.service.noteFast(message)
    } else if (message.subtype === 'thinking_tokens') {
      this.blocks.noteThinkingTokens(numberField(message, 'estimated_tokens'))
    } else {
      this.agents.applySystem(message, at)
    }
  }

  /**
   * /clear: CLI начал новый разговор. Всё выше он больше не помнит - лента начинается с
   * отметки, как в ACC; список задач, повторы и компакт того разговора уходят с ним.
   */
  private resetConversation() {
    const first = this.store.items[0]

    if (first) this.store.removeFrom(first.id)

    this.blocks.reset()
    this.service.reset()
    this.results.clear()
    this.turns.afterTruncate()
    this.taskList.restore([])
    this.tasksChanged = true
    this.agents.prune()
    this.addNotice('cleared')
  }

  private thumbnails(images: readonly ImageAttachment[]) {
    return images.map((image) => ({ thumbnail: this.thumbnail(image) }))
  }

  private nextId(prefix: string) {
    this.sequence += 1

    return `${prefix}:${this.sequence}`
  }
}
