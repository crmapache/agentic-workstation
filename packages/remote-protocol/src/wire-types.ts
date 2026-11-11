/**
 * Что IDE показывает телефону - формы данных протокола v1. Здесь нет путей на диске: проект на
 * проводе - ключ (`p-` открытый, `r-` недавний, дальше хеш пути), где он лежит, знает только
 * IDE. Провайдер назван в каждой записи: сейчас один - Claude Code (`claude`), но телефон
 * рисует любого по этим же формам.
 */

/** Как телефон читает разговор: свободен, идёт ход, ждёт человека (разрешение, вопрос, план). */
export type ConversationStatus = 'idle' | 'running' | 'waiting-for-you'

export type WaitingKind = 'permission' | 'question' | 'plan'

/** Модель провайдера: значение для запуска и подписи из каталога. */
export type ProviderModel = { value: string; label: string; description: string }

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
  /** С какого момента разговор в этом состоянии (мс, часы IDE). */
  since: number
  waiting: WaitingKind | null
}

/** Очереди сценариев проекта коротко: открытые, идущие прогоны, прогоны с вопросом к человеку. */
export type QueuesSummary = { open: number; running: number; asking: number }

export type InventoryProject = {
  key: string
  name: string
  /** Открыт вкладкой в IDE; недавний - только имя и его очереди (они живут на уровне IDE). */
  open: boolean
  conversations: ConversationSummary[]
  queues: QueuesSummary
}

export type Machine = { label: string; ideVersion: string }

/** Вопрос, на котором стоит ход. Ответ «разрешать всегда» с телефона не даётся. */
export type PendingWire =
  | {
      kind: 'permission'
      requestId: string
      toolName: string
      description: string
      reason: string
      input: unknown
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
    }
  | { kind: 'plan'; requestId: string; plan: string }

/** Разговор целиком - тому, кто его смотрит. */
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
}

/**
 * Элемент ленты - тот, что собирает IDE для своей панели (сообщение, ответ, вызов
 * инструмента, итог хода…): `kind` говорит вид, остальные поля - по виду. Длинные строки
 * дорога до телефона режет и говорит об этом в самом тексте.
 */
export type FeedItemWire = { id: string; kind: string } & Record<string, unknown>

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

export type RunQuestionWire = {
  stepKey: string
  title: string
  tool: string
  detail: string
  options: string[]
  askedAt: number
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
