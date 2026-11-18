import type {
  ClaudeState,
  HistoryEntry,
  ImageAttachment,
  RequestResponse,
  ConversationOptions,
} from '../claude'
import type { EditorRef, TakenQueued, MessageDraft } from '../claude-draft'
import type { FeedItem, FeedPatch, ConversationFeed } from '../claude-feed'
import type { PanelPrefsPatch, ConversationCall } from '../claude-prefs'
import type { RewindScope, RewindOutcome, RewindPreview } from '../claude-rewind'
import type { ProviderId } from '../providers'

/**
 * Часть контракта (contract.ts) про панели провайдеров ИИ (ADR 0083): разговоры, лента,
 * вкладки, очередь, вопросы, история, форк, откат. Одни каналы на все панели - провайдер в
 * каждом запросе и событии; свои каналы провайдера (аккаунты Claude, плагины, `/config`) -
 * в его контрактах. Правила те же (.claude/rules/ipc-contract.md).
 */

/** Какой панели провайдера запрос. */
type PanelRequest = { provider: ProviderId }

type ProjectRequest = { projectId: string }

type ConversationRequest = { conversationId: string }

/**
 * Сообщение человека: текст для CLI и картинки (base64), картинок может не быть. draft -
 * те же куски для ленты и очереди (чипы, цитаты), editor - что было открыто в
 * редакторе: модель получит это отдельной заметкой.
 */
type OutgoingRequest = {
  text: string
  images?: ImageAttachment[]
  draft?: MessageDraft
  editor?: EditorRef | null
}

export type AgentInvokeContract = {
  /** Разговоры с Claude Code во всех проектах (ADR 0009). */
  'agent:getState': { request: PanelRequest; response: ClaudeState }
  /** Лента разговора целиком: прошлые ходы из транскрипта CLI и живой ход. */
  'agent:getFeed': { request: PanelRequest & ConversationRequest; response: ConversationFeed }
  /**
   * Страница ранней истории («load earlier messages»): сообщения транскрипта выше
   * загруженного встают перед лентой. Ответ - лента целиком.
   */
  'agent:loadEarlier': { request: PanelRequest & ConversationRequest; response: ConversationFeed }
  /**
   * Страницы выше загруженного - до элемента itemId (прыжок к закреплённому сообщению):
   * одним шагом, сколько бы страниц ни было. Ответ - лента целиком.
   */
  'agent:loadThrough': {
    request: PanelRequest & ConversationRequest & { itemId: string }
    response: ConversationFeed
  }
  /**
   * Элементы ленты по id - загруженные и выше загруженного (полка закреплённых), в порядке
   * разговора. Чего нет в ответе, нет и в разговоре; null - транскрипт не прочитался.
   */
  'agent:feedItems': {
    request: PanelRequest & ConversationRequest & { itemIds: string[] }
    response: FeedItem[] | null
  }
  /** /status: строка SESSION в ленте - id разговора и как продолжить его в терминале. */
  'agent:showSessionInfo': { request: PanelRequest & ConversationRequest; response: ClaudeState }
  'agent:newConversation': { request: PanelRequest & ProjectRequest; response: ClaudeState }
  'agent:activateConversation': {
    request: PanelRequest & ConversationRequest
    response: ClaudeState
  }
  /** Сообщение человека. Во время хода - подсказка модели на её следующем шаге. */
  'agent:send': {
    request: PanelRequest & ConversationRequest & OutgoingRequest
    response: ClaudeState
  }
  /**
   * Отложить сообщение до конца хода. before - сосед, перед которым встать (сообщение
   * вынимали из очереди поправить); null или ушедший сосед - в конец.
   */
  'agent:enqueue': {
    request: PanelRequest & ConversationRequest & OutgoingRequest & { before?: string | null }
    response: ClaudeState
  }
  'agent:removeQueued': {
    request: PanelRequest & ConversationRequest & { queuedId: string }
    response: ClaudeState
  }
  /** Отправить отложенное сейчас: модель прочтёт его на следующем шаге. */
  'agent:sendQueued': {
    request: PanelRequest & ConversationRequest & { queuedId: string }
    response: ClaudeState
  }
  /**
   * Довериться папке проекта: Claude Code прочитает её настройки, хуки и CLAUDE.md. В
   * режиме потока CLI сам об этом не спрашивает - спрашивает панель.
   */
  'agent:trustProject': { request: PanelRequest & ProjectRequest; response: ClaudeState }
  /** Остановить ход: CLI закончит его сам. */
  'agent:interrupt': { request: PanelRequest & ConversationRequest; response: ClaudeState }
  /** CLI не ответил на остановку - погасить его процесс. */
  'agent:forceStop': { request: PanelRequest & ConversationRequest; response: ClaudeState }
  /** Ответ на вопрос CLI: разрешение, выбор, план. */
  'agent:respond': {
    request: PanelRequest & ConversationRequest & { requestId: string; response: RequestResponse }
    response: ClaudeState
  }
  'agent:setOptions': {
    request: PanelRequest & ConversationRequest & { options: ConversationOptions }
    response: ClaudeState
  }
  /** Прошлые разговоры проекта из транскриптов CLI. */
  'agent:listHistory': { request: PanelRequest & ProjectRequest; response: HistoryEntry[] }
  'agent:openHistory': {
    request: PanelRequest & ProjectRequest & { sessionId: string }
    response: ClaudeState
  }
  /** Поискать CLI заново: его могли поставить, пока IDE открыта. */
  'agent:recheckCli': { request: PanelRequest; response: ClaudeState }
  /**
   * Команда «!» в папке проекта: выполняет панель, а не агент; карточка живёт в ленте.
   * Ответ - сразу, не дожидаясь конца команды.
   */
  'agent:runShell': {
    request: PanelRequest & ConversationRequest & { command: string }
    response: ClaudeState
  }
  'agent:stopShell': {
    request: PanelRequest & ConversationRequest & { runId: string }
    response: ClaudeState
  }
  /**
   * Остановить задачу разговора - субагента или фоновую команду (stop_task CLI), не
   * трогая ход. О конце задачи CLI скажет сам, уведомлением.
   */
  'agent:stopTask': {
    request: PanelRequest & ConversationRequest & { taskId: string }
    response: ClaudeState
  }
  /**
   * Откатить файл последнего хода (path null - все его файлы); restore - вернуть
   * откаченное. Итог - в строках файлов итога хода, лентой.
   */
  'agent:revertChanges': {
    request: PanelRequest &
      ConversationRequest & { turnId: string; path: string | null; restore: boolean }
    response: ClaudeState
  }
  /** Картинка сообщения целиком (data URL): в ленте только миниатюры. null - её нет. */
  'agent:getImage': {
    request: PanelRequest & ConversationRequest & { messageId: string; index: number }
    response: string | null
  }
  /** Какие файлы вернёт откат кода к сообщению (ничего не меняет). */
  'agent:previewRewind': {
    request: PanelRequest & ConversationRequest & { messageId: string }
    response: RewindPreview
  }
  /** Откатить разговор и/или код к сообщению человека: оно и всё после уходит. */
  'agent:rewind': {
    request: PanelRequest & ConversationRequest & { messageId: string; scope: RewindScope }
    response: { state: ClaudeState; outcome: RewindOutcome }
  }
  /**
   * Форк в новой вкладке. beforeMessageId - форк несёт разговор до этого сообщения,
   * null - весь разговор на момент нажатия.
   */
  'agent:fork': {
    request: PanelRequest & ConversationRequest & { beforeMessageId: string | null }
    response: ClaudeState
  }
  /**
   * Закрыть вкладку; закрытую человеком можно вернуть (agent:reopenClosed). hasDraft -
   * в поле что-то написано: пустую вкладку с черновиком тоже стоит помнить.
   */
  'agent:closeConversation': {
    request: PanelRequest & { conversationId: string; hasDraft?: boolean }
    response: ClaudeState
  }
  /**
   * Вернуть закрытую вкладку на прежнее место, в прежнюю группу и под прежним id.
   * closedId null - последнюю закрытую.
   */
  'agent:reopenClosed': {
    request: PanelRequest & { projectId: string; closedId: string | null }
    response: ClaudeState
  }
  /** Имя от человека: перебивает любое, уходит в транскрипт (история, `claude --resume`). */
  'agent:rename': {
    request: PanelRequest & { conversationId: string; title: string }
    response: ClaudeState
  }
  /** Переставить форк внутри своей группы: перед вкладкой beforeId, null - в конец группы. */
  'agent:moveTab': {
    request: PanelRequest & { conversationId: string; beforeId: string | null }
    response: ClaudeState
  }
  /** Переставить группу форков целиком перед группой beforeId, null - в конец полосы. */
  'agent:moveGroup': {
    request: PanelRequest & { groupId: string; beforeId: string | null }
    response: ClaudeState
  }
  /** Вынуть сообщение из очереди в поле: пока его правят, оно вне очереди и не уйдёт. */
  'agent:takeQueued': {
    request: PanelRequest & ConversationRequest & { queuedId: string }
    response: { state: ClaudeState; taken: TakenQueued | null }
  }
  /** Переставить сообщение очереди на место toIndex. */
  'agent:moveQueued': {
    request: PanelRequest & ConversationRequest & { queuedId: string; toIndex: number }
    response: ClaudeState
  }
  /** Настройки панели (Settings): что не названо в патче - не меняется. */
  'agent:setPrefs': { request: PanelRequest & { patch: PanelPrefsPatch }; response: ClaudeState }
}

export type AgentEventContract = {
  /** Состояние панели провайдера целиком - после любого изменения. */
  'agent:state': { provider: ProviderId; state: ClaudeState }
  /** Изменение ленты разговора панели провайдера. */
  'agent:feed': { provider: ProviderId; patch: FeedPatch }
  /** Разговор панели провайдера позвал человека (звук, свечение вкладки). */
  'agent:call': { provider: ProviderId; call: ConversationCall }
}

export const AGENT_CHANNELS = {
  'agent:getState': true,
  'agent:getFeed': true,
  'agent:loadEarlier': true,
  'agent:loadThrough': true,
  'agent:feedItems': true,
  'agent:showSessionInfo': true,
  'agent:newConversation': true,
  'agent:activateConversation': true,
  'agent:send': true,
  'agent:enqueue': true,
  'agent:removeQueued': true,
  'agent:sendQueued': true,
  'agent:trustProject': true,
  'agent:interrupt': true,
  'agent:forceStop': true,
  'agent:respond': true,
  'agent:setOptions': true,
  'agent:listHistory': true,
  'agent:openHistory': true,
  'agent:recheckCli': true,
  'agent:runShell': true,
  'agent:stopShell': true,
  'agent:stopTask': true,
  'agent:revertChanges': true,
  'agent:getImage': true,
  'agent:previewRewind': true,
  'agent:rewind': true,
  'agent:fork': true,
  'agent:closeConversation': true,
  'agent:reopenClosed': true,
  'agent:rename': true,
  'agent:moveTab': true,
  'agent:moveGroup': true,
  'agent:takeQueued': true,
  'agent:moveQueued': true,
  'agent:setPrefs': true,
} as const satisfies Record<keyof AgentInvokeContract, true>

export const AGENT_EVENTS = {
  'agent:state': true,
  'agent:feed': true,
  'agent:call': true,
} as const satisfies Record<keyof AgentEventContract, true>
