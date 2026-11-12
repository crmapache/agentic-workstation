/**
 * Что IDE показывает телефону - формы данных протокола v1. Здесь нет путей на диске: проект на
 * проводе - ключ (`p-` и хеш пути, project-key.ts), где он лежит, знает только IDE. Путь в
 * тексте заменён метками папок (placeholders.ts). Провайдер назван в каждой записи: сейчас
 * один - Claude Code (`claude`), но телефон рисует любого по этим же формам.
 */

/** Как телефон читает разговор: свободен, идёт ход, ждёт человека (разрешение, вопрос, план). */
export type ConversationStatus = 'idle' | 'running' | 'waiting-for-you'

export type WaitingKind = 'permission' | 'question' | 'plan'

/**
 * Чем кончился последний ход: none - ходов не было; interrupted - остановили; failed - ошибкой
 * API или лимитом; crashed - процесс провайдера умер посреди хода или не поднялся. Новый ход
 * снимает прошлый исход: пока он идёт, исход - done.
 */
export type ConversationOutcome = 'none' | 'done' | 'interrupted' | 'failed' | 'crashed'

/**
 * Модель провайдера: значение для запуска и подписи из каталога. fast - у модели есть быстрый
 * режим (переключатель разговора на телефоне виден только у неё); нет поля - не сказано.
 */
export type ProviderModel = {
  value: string
  label: string
  description: string
  fast?: boolean | undefined
}

/** Провайдер и что у него можно выбрать с телефона - у каждого свои модели, усилия и режимы. */
export type ProviderCaps = {
  id: string
  label: string
  /** На месте ли (Claude Code найден на машине). */
  available: boolean
  /** Пусто - каталог ещё не спрашивали: телефон показывает «как в настройках». */
  models: ProviderModel[]
  efforts: string[]
  /** Режимы, которые телефон может выбрать новому разговору (без bypass и auto). */
  permissionModes: string[]
}

export type ConversationSummary = {
  id: string
  provider: string
  title: string
  status: ConversationStatus
  outcome: ConversationOutcome
  /** С какого момента разговор в этом состоянии (мс, часы IDE). */
  since: number
  waiting: WaitingKind | null
}

/** Очереди сценариев проекта коротко: открытые, идущие прогоны, прогоны с вопросом к человеку. */
export type QueuesSummary = { open: number; running: number; asking: number }

export type InventoryProject = {
  /** Один и тот же, открыт проект или закрыт (project-key.ts). */
  key: string
  name: string
  /** Открыт вкладкой в IDE; недавний - только имя и его очереди (они живут на уровне IDE). */
  open: boolean
  conversations: ConversationSummary[]
  queues: QueuesSummary
}

export type Machine = { label: string; ideVersion: string }

/**
 * Вопрос, на котором стоит ход. Ответ «разрешать всегда» с телефона не даётся. requestId -
 * то, на что отвечают: ответ на вопрос, которого уже нет, IDE отказывает кодом questionGone.
 *
 * truncated - IDE урезала что-то в вопросе, чтобы он влез в кадр (длинная команда, файл,
 * план), или вопрос не влез вовсе и пришёл карточкой без полей. Это явный флаг, а не догадка по
 * пометке в тексте: одобрить то, чего человек не видел целиком, телефон не даёт - только отказ
 * и «решите за Mac».
 */
export type PendingWire =
  | {
      kind: 'permission'
      requestId: string
      toolName: string
      description: string
      reason: string
      input: unknown
      truncated: boolean
    }
  | {
      kind: 'question'
      requestId: string
      questions: {
        question: string
        header: string
        options: { label: string; description: string }[]
        multiSelect: boolean
      }[]
      truncated: boolean
    }
  | { kind: 'plan'; requestId: string; plan: string; truncated: boolean }

/**
 * Панель сама продолжит разговор после лимита: когда (мс, часы IDE) и угадан ли срок (лимит
 * не сказал, когда сбросится). «Don't continue» снимает слова панели.
 */
export type CarryOnWire = { until: number; guess: boolean }

/**
 * Быстрый режим разговора: попросили ли его (fastMode) и что CLI сказал о нём в последний раз
 * (on, off, cooldown - пауза после лимита); null - ещё не говорил.
 */
export type FastWire = { asked: boolean; state: 'on' | 'off' | 'cooldown' | null }

/**
 * Разговор целиком - тому, кто его смотрит. Поля после context - с версии, где телефон умеет
 * очередь, быстрый режим и «Don't continue»: старая IDE их не шлёт, поэтому они необязательны.
 */
export type ConversationWire = ConversationSummary & {
  projectKey: string
  model: string | null
  effort: string | null
  permissionMode: string
  /** Модель, которую назвал провайдер в последний раз. */
  activeModel: string | null
  pending: PendingWire | null
  pendingCount: number
  queue: { id: string; text: string; imageCount: number }[]
  turnStartedAt: number | null
  workStartedAt: number | null
  workPausedMs: number
  /** Почему разговор не идёт - код провайдера (cli-not-found, untrusted…); null - идёт. */
  error: string | null
  context: { tokens: number; window: number }
  /** Человек нажал Stop (мс), а ход ещё идёт: телефон предлагает погасить процесс. */
  stopRequestedAt?: number | null | undefined
  /** Почему очередь стоит, хотя разговор свободен: paused, reopened, blocked; null - не держат. */
  queueHold?: string | null | undefined
  carryOn?: CarryOnWire | null | undefined
  fast?: FastWire | undefined
}

/**
 * Элемент ленты - тот, что собирает IDE для своей панели (сообщение, ответ, вызов
 * инструмента, итог хода…): `kind` говорит вид, остальные поля - по виду. Длинные строки
 * дорога до телефона режет и говорит об этом в самом тексте.
 */
export type FeedItemWire = { id: string; kind: string } & Record<string, unknown>

/**
 * Элемент, не влезший в кадр и урезанным: карточка с id, видом, `stub: true` и только простыми
 * полями своего вида (состояние, имя, короткий текст), без вложенных. Телефон рисует её
 * карточкой «слишком большой для телефона», а не элементом своего вида.
 */
export type FeedStubWire = { id: string; kind: string; stub: true } & Record<
  string,
  string | number | boolean | null
>

export const isFeedStub = (item: FeedItemWire): item is FeedStubWire => item['stub'] === true

export type FeedTaskWire = { id: string; subject: string; activeForm: string; state: string }

export type QueueItemWire = {
  id: string
  scenarioId: string
  scope: string
  scenarioName: string
  inputs: Record<string, string>
  provider: string
  afterSuccess: boolean
  addedAt: number
  runId: string
  state: 'waiting' | 'running' | 'done' | 'failed' | 'stopped'
  refusal: string | null
}

export type QueueWire = {
  id: string
  projectKey: string
  /**
   * Имя проекта для доски всех очередей: очередь переживает и закрытие проекта, и его уход из
   * недавних - а в инвентаре только открытые и недавние. Имя, не путь.
   */
  projectName: string
  name: string
  createdAt: number
  closedAt: number
  workdir: { kind: 'project' } | { kind: 'worktree'; gitBranch: string; removed: boolean }
  items: QueueItemWire[]
  stopAfterItemId: string
  hold: { reason: string; itemId: string; at: number } | null
  acknowledgedItemId: string
}

export type RoadmapStopWire = { state: string; stage: number; pass: number; title: string }

export type RunLimitWire = { account: string; window: string; until: number; reason: string }

export type RunSummaryWire = {
  id: string
  projectKey: string
  provider: string
  queueId: string
  itemId: string
  scenarioId: string
  scenarioName: string
  startedAt: number
  finishedAt: number
  state: string
  total: number
  done: number
  failure: string
  cost: number
  stageTitle: string
  at: string
  /** Что прогон спрашивает у человека; пусто - не спрашивает. */
  asking: string
  roadmap: RoadmapStopWire[]
  limit: RunLimitWire | null
  /** Отмечен звёздочкой в истории прогонов; нет поля - IDE старше этой отметки. */
  starred?: boolean | undefined
  /**
   * Кто вёл прогон: ide или acc (плагин ACC в JetBrains - его прогон IDE только показывает:
   * ни звезды, ни удаления, ни продолжения). Нет поля - IDE старше: прогон её.
   */
  origin?: string | undefined
}

export type RunStepWire = {
  key: string
  stageId: string
  pass: number
  title: string
  state: string
  startedAt: number
  finishedAt: number
  said: string
  summary: string
  verdict: string
  failure: string
  error: string
  cost: number
}

export type RunNoteWire = { at: number; stepKey: string; text: string; who: string }

/**
 * Вопрос прогона человеку. stepKey и askedAt - его опознание: ответ телефона несёт их, и IDE
 * отказывает (questionGone), если стоит уже другой вопрос. truncated - подробности урезаны
 * (движком или дорогой до телефона): разрешить вслепую телефон не даёт.
 */
export type RunQuestionWire = {
  stepKey: string
  title: string
  tool: string
  detail: string
  options: string[]
  askedAt: number
  truncated: boolean
}

/** Прогон целиком - тому, кто его смотрит: дорожка, шаги, вопрос головы. */
export type RunWire = Omit<RunSummaryWire, 'done' | 'stageTitle' | 'at' | 'asking' | 'roadmap'> & {
  stages: { id: string; title: string }[]
  steps: RunStepWire[]
  notes: RunNoteWire[]
  question: RunQuestionWire | null
  error: string
  answering: boolean
  inputs: Record<string, string>
}

/** Сценарий на полке - чтобы запустить его с телефона: имя и что спросить перед стартом. */
export type ShelfScenarioWire = {
  id: string
  scope: 'project' | 'user'
  name: string
  inputs: { id: string; name: string; label: string; placeholder: string; required: boolean }[]
}

/**
 * Прошлый разговор проекта у провайдера (у Claude Code - транскрипт CLI): открыть его - вкладка в
 * IDE, а телефону - обычный разговор. isOpen - уже открыт вкладкой.
 */
export type HistoryEntryWire = {
  sessionId: string
  title: string
  updatedAt: number
  isOpen: boolean
}

/**
 * Разговор, который открыли с телефона (conversation.new, conversation.openHistory): id его
 * вкладки в IDE - на него телефон и переходит.
 */
export type OpenedConversationWire = { conversationId: string }

/** История проекта на телефон: свежие сверху, сколько влезло в кадр; more - есть ещё старее. */
export type HistoryWire = { entries: HistoryEntryWire[]; more: boolean }

/**
 * Страница ленты выше того, что у телефона (conversation.earlier): элементы перед before по
 * порядку, сколько влезло в кадр. hasEarlier - выше этой страницы есть ещё.
 */
export type FeedPageWire = { items: FeedItemWire[]; hasEarlier: boolean }

/**
 * Картинка сообщения для просмотра на телефоне (conversation.image): data URL. Целиком она
 * весит мегабайты, а ответ - один кадр: не влезла - IDE уменьшает её (JPEG по длинной стороне),
 * и reduced это говорит. Оригинал остаётся в IDE.
 */
export type MessageImageWire = { dataUrl: string; reduced: boolean }
