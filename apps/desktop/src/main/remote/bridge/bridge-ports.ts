import type { AccountsState } from '@shared/accounts'
import type { SearchAnswer, AiSearchOutcome } from '@shared/claude-search'
import type { Connector } from '@shared/connectors'
import type {
  HistoryEntry,
  AgentPanelState,
  ImageAttachment,
  RequestResponse,
  ConversationOptions,
} from '@shared/conversation'
import type { ConversationFeed } from '@shared/conversation-feed'
import type { AsideExchange } from '@shared/panel-extras'
import type { ProviderId, ProviderInfo } from '@shared/providers'
import type { RewindScope, RewindOutcome, RewindPreview } from '@shared/rewind'
import type {
  QueueAction,
  ScenarioQueuesView,
  ScenarioStartOutcome,
  ScenarioStartRequest,
} from '@shared/scenario-queues'
import type { RunState, ScenarioRun, RunQuestionRef } from '@shared/scenario-runs'
import type {
  StepLogPage,
  RunControlRefusal,
  ScenarioRunControl,
  ScenarioHourRequest,
  ScenarioSaveOutcome,
  ScenarioShelvesView,
  ScenarioDraftOutcome,
} from '@shared/scenario-view'
import type { Scenario, ScenarioCode, ScenarioScope } from '@shared/scenarios'
import type { TaskRunSummary } from '@shared/tasks'
import type { WorkspaceState } from '@shared/workspace'

/**
 * Что мост Remote Control берёт у IDE - узко, только публичные действия сервисов, которыми
 * пользуется и окно. Мост не знает ни процессов CLI, ни движка сценариев; тест подставляет
 * подделки этих портов.
 */

/**
 * Разговоры одной панели провайдера (ADR 0083): Claude Code, Codex, открытые модели. id
 * разговоров - UUID вкладок, у двух панелей они не совпадают: команду по id ведёт панель, у
 * которой этот разговор. Своё Claude Code (слои настроек, продолжение после лимита, вопрос
 * сбоку) - необязательными методами: у других провайдеров их нет, и мост отказывает.
 */
export type ConversationsPort = {
  provider: ProviderId
  /**
   * Провайдер для всего, что не панель (как providers:list): на месте ли, модели, режимы и
   * уровни - по нынешнему состоянию панели; null - CLI ещё ищут.
   */
  info: () => ProviderInfo | null
  getState: () => AgentPanelState
  getFeed: (conversationId: string) => Promise<ConversationFeed>
  send: (
    conversationId: string,
    message: { text: string; images: ImageAttachment[] },
  ) => Promise<unknown>
  respond: (conversationId: string, requestId: string, response: RequestResponse) => unknown
  interrupt: (conversationId: string) => unknown
  /**
   * Новый разговор в проекте с выбором сразу - до того, как поднимется процесс. Ответ - id
   * созданного: не догадка по разнице списков, которую сбил бы разговор, открытый в окне в
   * ту же секунду.
   */
  newConversation: (projectPath: string, options: ConversationOptions) => Promise<string>
  /** Закрыть разговор, который не вышел таким, как просили (откат неудачного создания). */
  close: (conversationId: string) => Promise<unknown>
  setOptions: (conversationId: string, options: ConversationOptions) => unknown
  /**
   * Запретил ли режим без вопросов хоть один слой настроек проекта (claudeConfig:project) - то,
   * по чему окно гасит bypass в меню MODE. Нет - слоёв настроек у провайдера нет.
   */
  bypassDisabled?: ((projectPath: string) => Promise<boolean>) | undefined
  rename: (conversationId: string, title: string) => Promise<unknown>
  /** Прошлые разговоры проекта (agent:listHistory). */
  history: (projectPath: string) => Promise<HistoryEntry[]>
  /**
   * Открыть прошлый разговор вкладкой (agent:openHistory). Ответ - id вкладки; null - такого
   * разговора у проекта нет (транскрипт пропал), а не исключение посреди команды.
   */
  openHistory: (projectPath: string, sessionId: string) => Promise<string | null>
  /** Страница ранней истории в ленту IDE (agent:loadEarlier); ответ - лента целиком. */
  loadEarlier: (conversationId: string) => Promise<ConversationFeed>
  /** Картинка сообщения целиком, data URL (agent:getImage); null - её нет. */
  image: (conversationId: string, messageId: string, index: number) => Promise<string | null>
  /** Отложить до конца хода (agent:enqueue); разговор свободен - уходит сразу. */
  enqueue: (
    conversationId: string,
    message: { text: string; images: ImageAttachment[] },
  ) => Promise<unknown>
  unqueue: (conversationId: string, queuedId: string) => unknown
  moveQueued: (conversationId: string, queuedId: string, toIndex: number) => unknown
  sendQueued: (conversationId: string, queuedId: string) => Promise<unknown>
  forceStop: (conversationId: string) => unknown
  /** Остановить задачу CLI (stop_task): субагента или фоновую команду, ход не трогается. */
  stopTask: (conversationId: string, taskId: string) => unknown
  rewindPreview: (conversationId: string, messageId: string) => Promise<RewindPreview>
  rewind: (conversationId: string, messageId: string, scope: RewindScope) => Promise<RewindOutcome>
  /** «Don't continue» под планом продолжения (claudePanel:cancelCarryOn). */
  cancelCarryOn?: ((conversationId: string) => unknown) | undefined
  /**
   * Вопрос сбоку от телефона (AsideDesk.askFor): итог, когда он пришёл; null - id уже занят или
   * разговор сменился раньше ответа.
   */
  askAside?:
    | ((conversationId: string, question: string, askId: string) => Promise<AsideExchange | null>)
    | undefined
  cancelAside?: ((conversationId: string, askId: string) => unknown) | undefined
}

/** Панели провайдеров IDE - всё, что телефону о разговорах, с чьими бы они ни были. */
export type PanelsPort = {
  /** Панели по порядку: первой - Claude Code. */
  list: () => readonly ConversationsPort[]
  /**
   * Поискать CLI провайдеров заново (providers:list): их могли поставить, пока IDE открыта.
   * Перемена придёт состоянием панели.
   */
  refresh: () => Promise<unknown>
  /**
   * Файл с телефона - в каталог вставок IDE (claude:savePasted): путь на диске или null (пустой,
   * тяжелее потолка, не записался). Тот же путь, что у документа, вставленного в поле IDE любой
   * панели.
   */
  saveFile: (name: string, data: string) => Promise<string | null>
}

/** Поиск по разговорам проекта (SearchDesk): индексом и моделью. */
export type SearchPort = {
  find: (projectPath: string, query: string) => Promise<SearchAnswer>
  ask: (projectPath: string, runId: string, query: string) => Promise<AiSearchOutcome>
  cancel: (runId: string) => void
}

/**
 * Аккаунты Claude Code (AccountService и переезд панели): список и те же действия, что у
 * каналов accounts:* окна.
 */
export type AccountsPort = {
  /** Аккаунты и их лимиты, как в состоянии панели (AgentPanelState.accounts). */
  state: () => AccountsState
  /** Освежить лимиты аккаунтов - каждый не чаще своего шага; ответ - когда цифры пришли. */
  refreshUsage: (accountIds: string[]) => Promise<unknown>
  /** Выбрать аккаунт для всех разговоров: процессы переезжают, как освободятся. */
  use: (accountId: string) => void
  rename: (accountId: string, alias: string) => void
  forget: (accountId: string) => Promise<unknown>
  /** Выйти из обычного входа и перейти на соседний вошедший (PanelDesk.logout). */
  logout: () => Promise<unknown>
}

/** Коннекторы IDE (ConnectorsService): прочитать и переподключить. */
export type ConnectorsPort = {
  list: () => Connector[]
  reconnect: (connectorId: string) => Promise<unknown>
}

/**
 * Картинки для телефона: уменьшить, чтобы ответ влез в кадр. Это Electron (nativeImage), а мост
 * его не знает - тест подставляет свою подделку.
 */
export type PicturesPort = {
  /** JPEG не больше edge по длинной стороне, data URL; картинку не прочесть - null. */
  shrink: (dataUrl: string, edge: number, quality: number) => string | null
}

/** Сценарии на уровне IDE (ScenarioService, ADR 0039). */
export type ScenariosPort = {
  queuesView: () => ScenarioQueuesView
  start: (request: ScenarioStartRequest) => Promise<ScenarioStartOutcome>
  act: (queueId: string, action: QueueAction) => Promise<ScenarioCode | null>
  run: (projectPath: string, runId: string) => Promise<ScenarioRun | null>
  /** seen - для какого состояния нарисована кнопка на телефоне. */
  control: (
    projectPath: string,
    runId: string,
    action: ScenarioRunControl,
    seen: RunState,
  ) => RunControlRefusal | null
  /** false - вопроса, который видел телефон (asked), уже нет. */
  answer: (
    projectPath: string,
    runId: string,
    allow: boolean,
    text: string,
    asked: RunQuestionRef,
  ) => boolean
  tell: (projectPath: string, runId: string, text: string, images: ImageAttachment[]) => boolean
  carryOn: (runId: string) => Promise<ScenarioCode | null>
  shelves: (projectPath: string) => Promise<ScenarioShelvesView>
  fetch: (projectPath: string, id: string, scope: ScenarioScope) => Promise<Scenario | null>
  duplicate: (projectPath: string, id: string, scope: ScenarioScope) => Promise<ScenarioCode | null>
  delete: (projectPath: string, id: string, scope: ScenarioScope) => Promise<ScenarioCode | null>
  draft: (
    projectPath: string,
    draftId: string,
    description: string,
    scope: ScenarioScope,
  ) => Promise<ScenarioDraftOutcome>
  cancelDraft: (draftId: string) => void
  save: (
    projectPath: string,
    scenario: Scenario,
    scope: ScenarioScope,
  ) => Promise<ScenarioSaveOutcome>
  /** Журнал шага (key - шаг, 'head' - голова); earlier - подгрузить страницу выше. */
  log: (projectPath: string, runId: string, key: string, earlier: boolean) => Promise<StepLogPage>
  starRun: (projectPath: string, runId: string, starred: boolean) => Promise<ScenarioCode | null>
  deleteRun: (projectPath: string, runId: string) => Promise<ScenarioCode | null>
  schedule: (projectPath: string, hour: ScenarioHourRequest) => Promise<ScenarioCode | null>
  unschedule: (projectPath: string, scheduleId: string) => Promise<ScenarioCode | null>
}

/** Задания по расписанию (TaskService, ADR 0069): их прогоны - работа проекта на телефоне. */
export type TasksPort = {
  /** Прогоны всех заданий, как у tasks:get окна. */
  runs: () => readonly Pick<TaskRunSummary, 'projectPath' | 'state'>[]
}

export type WorkspacePort = {
  getState: () => WorkspaceState
  /** Открыть недавний проект вкладкой в окне IDE (workspace:openRecentProject). */
  openRecent: (rootPath: string) => Promise<unknown>
}

export type BridgePorts = {
  panels: PanelsPort
  scenarios: ScenariosPort
  tasks: TasksPort
  workspace: WorkspacePort
  pictures: PicturesPort
  search: SearchPort
  accounts: AccountsPort
  connectors: ConnectorsPort
}
