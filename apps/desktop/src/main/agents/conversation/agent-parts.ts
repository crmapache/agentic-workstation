import type {
  SlashCommand,
  PendingRequest,
  ImageAttachment,
  RequestResponse,
  ConversationOptions,
} from '@shared/conversation'
import type {
  FeedItem,
  NoticeCode,
  StopReason,
  ClosedReason,
  ConversationFeed,
} from '@shared/conversation-feed'
import type { SoundEvent } from '@shared/sounds'

import type { WorkClock } from '../feed/work-clock'
import type { ConversationRuntime } from './conversation-runtime'
import type { Outgoing } from './outbox'

/**
 * Части разговора, которые ядро (ADR 0083) знает только по интерфейсу: живая сессия CLI
 * провайдера, сборщик ленты, правки хода, команды `!`. Делает их драйвер провайдера - у
 * Claude это процесс `claude -p`, его поток и транскрипт; ядро о них не знает.
 */

/** Вопрос, на котором стоит ход: что видит окно. Своё для ответа драйвер держит в том же объекте. */
/**
 * Вопрос к человеку, который держит разговор. ownAfterTurn - вопрос задала сама панель после
 * хода (план Codex): Stop без идущего хода снимает только такие - вопрос фонового субагента
 * CLI ждёт человека и после хода.
 */
export type HeldRequest = { pending: PendingRequest; ownAfterTurn?: boolean | undefined }

/** Коннекторы IDE процесса разговора (ADR 0029): работа встала, разговор закрыт насовсем. */
export type ConnectorsHandle = { idle: () => void; end: () => void }

/** Что ядро делает с лентой разговора сверх записи драйвера: остановка, обрыв, фоновая работа. */
export type AgentFeedBuilder = {
  /** Элементы ленты по порядку - то, что видит окно. */
  readonly items: readonly FeedItem[]
  readonly work: WorkClock
  /** Ход кончился, а фоновые агенты ещё работают: для точки на вкладке это «работает». */
  readonly hasBackgroundWork: boolean
  /** Идут фоновые команды: процесс не засыпает, пока они живы. */
  readonly hasBackgroundCommands: boolean
  /** Агент поставил себе будильник, и он ещё не сработал: его держит процесс. */
  readonly hasWakeup: boolean
  noteStopped: (reason?: StopReason) => void
  abortTurn: (code: NoticeCode, detail: string) => void
  abortBackground: (reason?: ClosedReason) => void
}

/** Лента разговора: снимок для окна и рассылка заплаток. Прошлые ходы читает драйвер. */
export type AgentFeed = {
  readonly builder: AgentFeedBuilder
  ensureLoaded: () => Promise<void>
  snapshot: () => ConversationFeed
  /** Страница ранней истории - лента целиком. */
  loadEarlier: () => Promise<ConversationFeed>
  /** Страницы выше - до элемента ленты (прыжок к закреплённому). */
  loadThrough: (itemId: string) => Promise<ConversationFeed>
  /** Элементы по id, загруженные и выше загруженного; null - журнал не прочитать. */
  itemsById: (itemIds: readonly string[]) => Promise<FeedItem[] | null>
  schedule: () => void
  flush: () => void
  dispose: () => void
}

/** Команды `!`: их выполняет панель, модель видит их со следующим сообщением. */
export type AgentShells = {
  run: (command: string, cwd: string) => Promise<void>
  stop: (runId: string) => void
  stopAll: () => void
}

/**
 * Живая сессия разговора у CLI провайдера: процесс и его протокол. Ответы на вопросы,
 * остановка, исходящее сообщение - словами этого CLI.
 */
export type AgentSession = {
  readonly isAlive: boolean
  readonly isStopping: boolean
  /**
   * Принимает ли сессия сообщение посреди хода. false - сообщение ждёт в очереди разговора до
   * конца хода (агенты ACP); нет поля - принимает (Claude, Codex, OpenCode).
   */
  readonly steers?: boolean
  /** Сообщение человека; steering - посреди идущего хода. */
  send: (message: Outgoing, steering: boolean) => void
  /** Человек написал в чат, пока ход стоит на вопросе: сообщение и отказ - в порядке CLI. */
  answerInChat: (held: HeldRequest, message: Outgoing) => void
  /** Ответ человека на вопрос (вопрос уже снят с разговора). */
  answer: (held: HeldRequest, response: RequestResponse) => void
  /** Вопрос снят остановкой хода: CLI получает отказ. */
  dismiss: (held: HeldRequest) => void
  /** Остановить ход; ход кончится словами CLI. */
  interrupt: () => Promise<void>
  stop: () => Promise<void>
  kill: () => void
}

/**
 * Провайдер для разговора: части разговора, живая сессия, настройки. Один на провайдера;
 * разговоры ядра зовут его, не зная, чей он.
 */
export type AgentDriver = {
  /** Лента, правки хода и команды `!` нового разговора. */
  attach: (runtime: ConversationRuntime) => { feed: AgentFeed; shells: AgentShells }
  /**
   * Поднять сессию: CLI, папка, коннекторы. null - не поднять, причина уже во вкладке
   * (`error`). Сбой подготовки - исключение: ядро покажет его как `start-failed`.
   */
  open: (runtime: ConversationRuntime) => Promise<AgentSession | null>
  /** Модель, усилие, режим, быстрый режим: живой сессии - без перезапуска. */
  setOptions: (runtime: ConversationRuntime, options: ConversationOptions) => void
}

/** Что разговору нужно от сервиса панели: доверие, рассылка, зов, коннекторы, драйвер. */
export type AgentHost = {
  readonly driver: AgentDriver
  isTrusted: (projectPath: string) => Promise<boolean>
  onChange: () => void
  onCommands: (projectPath: string, commands: SlashCommand[]) => void
  /** Миниатюра картинки сообщения для ленты (data URL) - делает Electron. */
  thumbnail: (image: ImageAttachment) => string
  /** Аккаунт, на котором сейчас поднимаются сессии разговоров. */
  accountId: () => string
  /**
   * Разговор позвал человека: вопрос, конец хода, лимит, поломка (звук и свечение
   * вкладки). key - у повода, который CLI повторяет (лимит того же окна): зовёт раз.
   */
  onCall: (conversationId: string, reason: SoundEvent, key?: string) => void
}
