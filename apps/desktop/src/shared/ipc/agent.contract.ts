import type {
  HistoryEntry,
  AgentPanelState,
  ImageAttachment,
  RequestResponse,
  ConversationOptions,
} from '../conversation'
import type { FeedItem, FeedPatch, ConversationFeed } from '../conversation-feed'
import type { EditorRef, TakenQueued, MessageDraft } from '../message-draft'
import type { PanelPrefsPatch, ConversationCall } from '../panel-prefs'
import type { ProviderId } from '../providers'
import type { RewindScope, RewindOutcome, RewindPreview } from '../rewind'

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
  'agent:getState': { request: PanelRequest; response: AgentPanelState }
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
  'agent:showSessionInfo': {
    request: PanelRequest & ConversationRequest
    response: AgentPanelState
  }
  'agent:newConversation': { request: PanelRequest & ProjectRequest; response: AgentPanelState }
  'agent:activateConversation': {
    request: PanelRequest & ConversationRequest
    response: AgentPanelState
  }
  /** Сообщение человека. Во время хода - подсказка модели на её следующем шаге. */
  'agent:send': {
    request: PanelRequest & ConversationRequest & OutgoingRequest
    response: AgentPanelState
  }
  /**
   * Отложить сообщение до конца хода. before - сосед, перед которым встать (сообщение
   * вынимали из очереди поправить); null или ушедший сосед - в конец.
   */
  'agent:enqueue': {
    request: PanelRequest & ConversationRequest & OutgoingRequest & { before?: string | null }
    response: AgentPanelState
  }
  'agent:removeQueued': {
    request: PanelRequest & ConversationRequest & { queuedId: string }
    response: AgentPanelState
  }
  /** Отправить отложенное сейчас: модель прочтёт его на следующем шаге. */
  'agent:sendQueued': {
    request: PanelRequest & ConversationRequest & { queuedId: string }
    response: AgentPanelState
  }
  /**
   * Довериться папке проекта: Claude Code прочитает её настройки, хуки и CLAUDE.md. В
   * режиме потока CLI сам об этом не спрашивает - спрашивает панель.
   */
  'agent:trustProject': { request: PanelRequest & ProjectRequest; response: AgentPanelState }
  /** Остановить ход: CLI закончит его сам. */
  'agent:interrupt': { request: PanelRequest & ConversationRequest; response: AgentPanelState }
  /** CLI не ответил на остановку - погасить его процесс. */
  'agent:forceStop': { request: PanelRequest & ConversationRequest; response: AgentPanelState }
  /** Ответ на вопрос CLI: разрешение, выбор, план. */
  'agent:respond': {
    request: PanelRequest & ConversationRequest & { requestId: string; response: RequestResponse }
    response: AgentPanelState
  }
  'agent:setOptions': {
    request: PanelRequest & ConversationRequest & { options: ConversationOptions }
    response: AgentPanelState
  }
  /** Прошлые разговоры проекта из транскриптов CLI. */
  'agent:listHistory': { request: PanelRequest & ProjectRequest; response: HistoryEntry[] }
  'agent:openHistory': {
    request: PanelRequest & ProjectRequest & { sessionId: string }
    response: AgentPanelState
  }
  /** Поискать CLI заново: его могли поставить, пока IDE открыта. */
  'agent:recheckCli': { request: PanelRequest; response: AgentPanelState }
  /** Освежить лимиты аккаунтов панели; чаще своего шага панель аккаунт не спрашивает. */
  'agent:refreshUsage': {
    request: PanelRequest & { accountIds: string[] }
    response: AgentPanelState
  }
  /** Вход аккаунта провайдера с экрана входа; ответ - сразу, конец входа придёт состоянием. */
  'agent:signIn': { request: PanelRequest & { accountId: string }; response: AgentPanelState }
  'agent:cancelSignIn': { request: PanelRequest; response: AgentPanelState }
  /** Код со страницы входа - CLI агента, который его ждёт (`agy`, ADR 0092). */
  'agent:submitSignInCode': { request: PanelRequest & { code: string }; response: AgentPanelState }
  /** Вошёл ли аккаунт в работе - заново (человек мог войти мимо панели). */
  'agent:checkSignIn': { request: PanelRequest; response: AgentPanelState }
  /** Выйти из аккаунта строки (у Claude - только из обычного входа). */
  'agent:signOut': { request: PanelRequest & { accountId: string }; response: AgentPanelState }
  /** Новый аккаунт провайдера: вход в него начинается сразу, панель ждёт его сама. */
  'agent:addAccount': { request: PanelRequest; response: AgentPanelState }
  /** Выбрать аккаунт для всех разговоров панели: процессы перейдут, как освободятся. */
  'agent:selectAccount': {
    request: PanelRequest & { accountId: string }
    response: AgentPanelState
  }
  'agent:renameAccount': {
    request: PanelRequest & { accountId: string; alias: string }
    response: AgentPanelState
  }
  'agent:forgetAccount': {
    request: PanelRequest & { accountId: string }
    response: AgentPanelState
  }
  /**
   * Команда «!» в папке проекта: выполняет панель, а не агент; карточка живёт в ленте.
   * Ответ - сразу, не дожидаясь конца команды.
   */
  'agent:runShell': {
    request: PanelRequest & ConversationRequest & { command: string }
    response: AgentPanelState
  }
  'agent:stopShell': {
    request: PanelRequest & ConversationRequest & { runId: string }
    response: AgentPanelState
  }
  /**
   * Остановить задачу разговора - субагента или фоновую команду (stop_task CLI), не
   * трогая ход. О конце задачи CLI скажет сам, уведомлением.
   */
  'agent:stopTask': {
    request: PanelRequest & ConversationRequest & { taskId: string }
    response: AgentPanelState
  }
  /**
   * Откатить файл последнего хода (path null - все его файлы); restore - вернуть
   * откаченное. Итог - в строках файлов итога хода, лентой.
   */
  'agent:revertChanges': {
    request: PanelRequest &
      ConversationRequest & { turnId: string; path: string | null; restore: boolean }
    response: AgentPanelState
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
    response: { state: AgentPanelState; outcome: RewindOutcome }
  }
  /**
   * Форк в новой вкладке. beforeMessageId - форк несёт разговор до этого сообщения,
   * null - весь разговор на момент нажатия.
   */
  'agent:fork': {
    request: PanelRequest & ConversationRequest & { beforeMessageId: string | null }
    response: AgentPanelState
  }
  /**
   * Закрыть вкладку; закрытую человеком можно вернуть (agent:reopenClosed). hasDraft -
   * в поле что-то написано: пустую вкладку с черновиком тоже стоит помнить.
   */
  'agent:closeConversation': {
    request: PanelRequest & { conversationId: string; hasDraft?: boolean }
    response: AgentPanelState
  }
  /**
   * Вернуть закрытую вкладку на прежнее место, в прежнюю группу и под прежним id.
   * closedId null - последнюю закрытую.
   */
  'agent:reopenClosed': {
    request: PanelRequest & { projectId: string; closedId: string | null }
    response: AgentPanelState
  }
  /** Имя от человека: перебивает любое, уходит в транскрипт (история, `claude --resume`). */
  'agent:rename': {
    request: PanelRequest & { conversationId: string; title: string }
    response: AgentPanelState
  }
  /** Переставить форк внутри своей группы: перед вкладкой beforeId, null - в конец группы. */
  'agent:moveTab': {
    request: PanelRequest & { conversationId: string; beforeId: string | null }
    response: AgentPanelState
  }
  /** Переставить группу форков целиком перед группой beforeId, null - в конец полосы. */
  'agent:moveGroup': {
    request: PanelRequest & { groupId: string; beforeId: string | null }
    response: AgentPanelState
  }
  /** Вынуть сообщение из очереди в поле: пока его правят, оно вне очереди и не уйдёт. */
  'agent:takeQueued': {
    request: PanelRequest & ConversationRequest & { queuedId: string }
    response: { state: AgentPanelState; taken: TakenQueued | null }
  }
  /** Переставить сообщение очереди на место toIndex. */
  'agent:moveQueued': {
    request: PanelRequest & ConversationRequest & { queuedId: string; toIndex: number }
    response: AgentPanelState
  }
  /** Настройки панели (Settings): что не названо в патче - не меняется. */
  'agent:setPrefs': {
    request: PanelRequest & { patch: PanelPrefsPatch }
    response: AgentPanelState
  }
}

export type AgentEventContract = {
  /** Состояние панели провайдера целиком - после любого изменения. */
  'agent:state': { provider: ProviderId; state: AgentPanelState }
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
  'agent:refreshUsage': true,
  'agent:signIn': true,
  'agent:cancelSignIn': true,
  'agent:submitSignInCode': true,
  'agent:checkSignIn': true,
  'agent:signOut': true,
  'agent:addAccount': true,
  'agent:selectAccount': true,
  'agent:renameAccount': true,
  'agent:forgetAccount': true,
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
