import type { AccountsState } from './claude-accounts'
import type { MessageDraft } from './claude-draft'
import type { ToolInput } from './claude-feed'
import type { ModelNote, FastReport, CarryOnPlan, ConversationMods } from './claude-panel'
import type { PanelPrefs } from './claude-prefs'

/**
 * Разговоры с Claude Code: вкладки правой панели, их настройки и состояние хода.
 * Владелец - главный процесс (main/claude), окно зеркалит (ADR 0003, 0009). Лента
 * разговора - отдельно, в claude-feed.ts: она большая и меняется на каждую букву.
 */

/** Режим разрешений CLI (`--permission-mode`). default - «спрашивать» (в CLI - manual). */
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions'

export const PERMISSION_MODES: readonly PermissionMode[] = [
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'bypassPermissions',
]

/** Сколько модель думает (`--effort`). null - как в настройках CLI. */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export const EFFORT_LEVELS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']

/**
 * Модель, которую можно выбрать: значение для CLI и подписи из его каталога. fast - есть
 * ли у неё быстрый режим (supportsFastMode), resolved - во что CLI разворачивает выбор
 * («opus» → «claude-opus-5-5»): по нему судят, доехал ли выбор.
 */
export type ModelInfo = {
  value: string
  displayName: string
  description: string
  fast?: boolean | undefined
  resolved?: string | undefined
}

/**
 * Где ход. idle - ждёт человека; running - модель работает; waiting - стоит на
 * вопросе к человеку (разрешение, выбор, план).
 */
export type ConversationStatus = 'idle' | 'running' | 'waiting'

/** Вариант ответа на вопрос AskUserQuestion. */
export type QuestionOption = { label: string; description: string }

export type Question = {
  question: string
  /** Короткая метка вопроса - чип над текстом. */
  header: string
  options: QuestionOption[]
  multiSelect: boolean
}

/** Вопрос, на котором стоит ход. requestId - id управляющего запроса CLI. */
export type PendingRequest =
  | {
      kind: 'permission'
      requestId: string
      toolUseId: string
      toolName: string
      input: ToolInput
      /** Короткое описание действия от CLI: имя файла, команда. */
      description: string
      /** Почему CLI спрашивает: правило, хук, классификатор. Пусто - обычный вопрос. */
      reason: string
      /**
       * Как «разрешить и дальше»: rule - правилом в настройках проекта, mode - режимом
       * на этот разговор (CLI предложил, например, принимать правки). null - нельзя.
       */
      alwaysKind: 'rule' | 'mode' | null
      /** Режим, в котором спросили: в карточке «under <mode>» - почему вопрос вообще возник. */
      mode: PermissionMode
    }
  | {
      kind: 'question'
      requestId: string
      toolUseId: string
      questions: Question[]
      /**
       * Вопрос, на котором оборвался разговор из истории: спросивший процесс умер, ответ
       * уйдёт новым сообщением, а не ответом на вызов («never answered»).
       */
      reopened?: boolean | undefined
      /** Спрашивает мод CLI ($.ui.ask), а не модель: вызова в ленте у него нет. */
      fromMod?: boolean | undefined
    }
  | { kind: 'plan'; requestId: string; toolUseId: string; plan: string }

/** Ответ человека на вопрос разрешения. */
export type PermissionDecision =
  { behavior: 'allow' } | { behavior: 'allowAlways' } | { behavior: 'deny'; message: string }

/** Ответ на AskUserQuestion: по тексту вопроса - выбранные подписи через запятую или свой текст. */
export type QuestionAnswers = Record<string, string>

export type RequestResponse =
  | { kind: 'permission'; decision: PermissionDecision }
  | { kind: 'question'; answers: QuestionAnswers }
  | { kind: 'plan'; approved: boolean; acceptEdits: boolean; feedback: string }

/** Сколько занято окна контекста. */
export type ConversationUsage = {
  contextTokens: number
  /** 0 - CLI ещё не сказал размер окна. */
  contextWindow: number
}

/**
 * Почему разговор не может идти - код, текст окно берёт из i18n. untrusted - папке
 * проекта ещё не доверились: Claude Code прочитает её настройки, хуки и CLAUDE.md.
 */
/**
 * Почему разговор не начинается: нет CLI, папка не доверена или пропала, процесс не
 * поднялся (start-failed - сбой подготовки, подробности в журнале IDE).
 */
export type ConversationError = 'cli-not-found' | 'untrusted' | 'project-missing' | 'start-failed'

/**
 * Откуда форк: разговор-источник и строка его транскрипта, до которой форк несёт
 * разговор (включительно). Точка фиксируется в момент нажатия: источник мог
 * продолжить работу, а форк унести только то, что человек видел.
 */
export type ForkOrigin = {
  sourceSessionId: string
  sourceTitle: string
  at: string
  /**
   * Форк просили резать по сообщению, а его в транскрипте не нашлось: несёт разговор
   * целиком и говорит об этом строкой под швом (как ACC).
   */
  whole?: boolean | undefined
}

/** Форматы картинок, которые принимает API. */
export const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const

export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number]

/** Картинка в сообщении человека: base64 без префикса `data:`. */
export type ImageAttachment = { mediaType: ImageMediaType; data: string }

/**
 * Сообщение, отложенное до конца хода. id - чтобы убрать именно его, а не соседа.
 * Картинки держит главный процесс в памяти: окну хватает их числа. draft - куски
 * сообщения для строки очереди (чипы вместо путей); null - сообщение пришло без них.
 */
export type QueuedMessage = {
  id: string
  text: string
  imageCount: number
  draft: MessageDraft | null
}

/**
 * Откуда имя вкладки - ранг решает, кто кого перебивает: заглушка < догадка по первому
 * сообщению < имя от модели < имя от человека. Младший старшего не перебивает.
 */
export type TitleSource = 'default' | 'heuristic' | 'llm' | 'user'

/** Ранги имени по возрастанию. */
export const TITLE_SOURCES: readonly TitleSource[] = ['default', 'heuristic', 'llm', 'user']

/** Самое длинное имя, которое человек даёт вкладке (столько же держит поле). */
export const OWN_TITLE_MAX = 100

/**
 * Чем кончился последний ход. none - ходов ещё не было; interrupted - человек остановил;
 * error - ошибкой API или лимитом; crashed - процесс умер посреди хода или не поднялся.
 * Новый ход снимает interrupted, error и crashed. На диск уходит только «был ход или нет».
 */
export type TurnOutcome = 'none' | 'done' | 'interrupted' | 'error' | 'crashed'

/** Вкладка разговора в правой панели. */
export type Conversation = {
  id: string
  /** Папка проекта: по ней разговоры возвращаются, когда проект открывают снова. */
  projectPath: string
  /** id сессии CLI: по нему разговор продолжается после перезапуска (`--resume`). */
  sessionId: string
  /** Пусто - разговор ещё не начат, окно показывает «New chat». */
  title: string
  titleSource: TitleSource
  /**
   * Группа форков: разговор и все форки от него стоят рядом и носят один цвет. id
   * группы - id вкладки, с которой всё началось.
   */
  groupId: string
  /** Глубина форка: 0 - корень группы, 1 - форк, 2 - форк форка. */
  depth: number
  status: ConversationStatus
  outcome: TurnOutcome
  /** Ход кончился, а фоновые субагенты ещё работают: для точки на вкладке это «работает». */
  backgroundWork: boolean
  /** Модель для CLI. null - как в настройках CLI. */
  model: string | null
  effort: EffortLevel | null
  permissionMode: PermissionMode
  /** Модель, которую назвал CLI в последний раз: «claude-opus-5-5». */
  activeModel: string | null
  usage: ConversationUsage
  /** Первый из вопросов, на которых стоит ход; остальные ждут за ним. */
  pending: PendingRequest | null
  /** Сколько вопросов ждёт всего (параллельные вызовы спрашивают разом). */
  pendingCount: number
  /**
   * Сообщения, которые уйдут по одному, когда ход кончится. Остановленный или
   * упавший ход очередь не трогает: она ждёт, пока человек отправит её сам.
   */
  queue: QueuedMessage[]
  /** Когда начался текущий ход (мс). null - хода нет. */
  turnStartedAt: number | null
  /** Когда человек нажал «стоп» (мс): ход ещё не кончился, окно показывает «останавливаю». */
  stopRequestedAt: number | null
  /**
   * Работа над запросом человека (как в ACC): с какого момента идёт (мс) и сколько из
   * этого простояло на вопросах. Один запрос - это и ходы, поднятые отчётами фоновых
   * агентов: счётчик в строке статуса идёт от сообщения, а не от последнего хода.
   * null - работа стоит.
   */
  workStartedAt: number | null
  workPausedMs: number
  error: ConversationError | null
  /** Форк другого разговора. Пока форк не родился (нет транскрипта), CLI поднимает его от источника. */
  fork: ForkOrigin | null
  /** Последнее изменение (мс). */
  updatedAt: number
  /** Быстрый режим попросили (панель; ездит с разговором, новая вкладка - без него). */
  fastMode?: boolean | undefined
  /** Что CLI сказал о быстром режиме в последний раз; нет - ещё не говорил. */
  fastReport?: FastReport | undefined
  /** Модель разговора не та, что выбрана: акцент на MODEL и подсказка. */
  modelNote?: ModelNote | undefined
  /** Что моды CLI держат на экране сейчас; нет - модов нет. */
  mods?: ConversationMods | undefined
  /** Панель сама продолжит разговор после лимита - строка плана в конце ленты. */
  carryOn?: CarryOnPlan | undefined
  /** Почему очередь стоит, хотя вкладка свободна; нет - не держат (подпись очереди). */
  queueHold?: QueueHold | undefined
}

/**
 * Что держит очередь. paused - ход кончился остановкой или ошибкой: очередь уйдёт после
 * следующего сообщения человека; reopened - то же у вернувшейся закрытой вкладки (ход,
 * которого она ждала, закрытие убило); blocked - сообщения не смогли уйти (папка не
 * доверена, CLI нет) и уйдут первыми, как только причину снимут.
 */
export type QueueHold = 'paused' | 'reopened' | 'blocked'

/** Слэш-команда для подсказки в поле. */
/**
 * Слэш-команда от CLI. builtin - своя команда CLI (/compact, /clear, /mcp), а не скилл,
 * команда проекта или подсказка MCP-сервера.
 */
export type SlashCommand = {
  name: string
  description: string
  argumentHint: string
  builtin?: boolean | undefined
}

/** Нашёлся ли Claude Code на машине. unknown - ещё ищем. */
export type CliStatus = 'unknown' | 'found' | 'missing'

/**
 * Вкладка, закрытая человеком: её можно вернуть на прежнее место - с моделью, очередью
 * и черновиком (черновик держит окно под тем же id).
 */
export type ClosedConversation = {
  /** id вкладки: вернётся под ним же. */
  id: string
  title: string
  titleSource: TitleSource
  /** Нерождённый форк: пустое имя читается «Fork of …», как на вкладке. */
  fork: ForkOrigin | null
  /** Глубина в группе: больше нуля - форк, строка истории так и говорит. */
  depth: number
  closedAt: number
}

/** Все разговоры IDE: по вкладке на разговор, у каждого проекта - выбранный. */
export type ClaudeState = {
  /** В порядке полосы вкладок: группа форков - подряд. */
  conversations: Conversation[]
  /** Выбранный разговор по папке проекта. */
  activeByProject: Record<string, string>
  /** Закрытые человеком вкладки по папке проекта, последние первыми (до 20). */
  closedByProject: Record<string, ClosedConversation[]>
  /** Команды, которые CLI назвал последними, - по папке проекта. */
  commandsByProject: Record<string, SlashCommand[]>
  /**
   * Свои команды CLI (/compact, /clear, /mcp…) с пояснениями - служебным запросом при
   * старте IDE, без разговора: подсказка «/» знает их и до первого хода. Пустой - CLI ещё
   * не ответил.
   */
  builtinCommands: SlashCommand[]
  /** Каталог моделей от CLI. Пустой - CLI ещё не спрашивали, окно берёт свой список. */
  models: ModelInfo[]
  cli: CliStatus
  accounts: AccountsState
  /** Настройки панели: экран Settings бокового меню. */
  prefs: PanelPrefs
  /** Режимы, в которые CLI отказался переходить: Shift+Tab и меню MODE их пропускают. */
  refusedModes: RefusedModes
}

/**
 * Отказы CLI перейти в режим (как в ACC): узнать заранее негде, только попробовать.
 * bypass - запрет организации, один на всю панель; auto - по модели: он есть не на
 * каждой, и отказ на одной не гасит его на другой. Живут, пока жива IDE.
 */
export type RefusedModes = { bypass: boolean; autoModels: string[] }

/** Модель, по которой судят отказ auto: выбранная, а без выбора - названная CLI. */
export const modeModel = (conversation: Pick<Conversation, 'model' | 'activeModel'>): string =>
  conversation.model ?? conversation.activeModel ?? ''

/** Прошлый разговор проекта из транскриптов CLI (~/.claude/projects). */
export type HistoryEntry = {
  sessionId: string
  title: string
  updatedAt: number
  /** Открыт ли он сейчас вкладкой. */
  isOpen: boolean
}

/**
 * Клавиша панели, которую ловит меню приложения, а не страница: ⌘W меню отдаёт
 * панели, когда фокус в ней (иначе закрыло бы окно).
 */
export type PanelKeyCommand = 'closeTab'

/** Новые настройки разговора: что не передано - не меняется. */
export type ConversationOptions = {
  model?: string | null
  effort?: EffortLevel | null
  permissionMode?: PermissionMode
  /** Быстрый режим (/fast, пункт в меню MODEL): просьба уходит CLI заявкой. */
  fastMode?: boolean
}
