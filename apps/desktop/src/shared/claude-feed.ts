/**
 * Лента разговора с Claude Code: то, что окно рисует сверху вниз. Собирает её главный
 * процесс из потока CLI (main/claude/feed), окно только показывает - разбора
 * протокола в окне нет (ADR 0009).
 */

import type { EditorRef, MessageDraft } from './claude-draft'
import type { CarryOnReason } from './claude-panel'

/** Кусок диффа правки, как его отдаёт CLI (`structuredPatch`). */
export type PatchHunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  /** Строки с префиксом: «+» добавлена, «-» удалена, пробел - контекст. */
  lines: string[]
}

/** Чем закончился вызов инструмента. Текст длинного вывода обрезан. */
export type ToolResult = {
  text: string
  isError: boolean
  /** Вывод не влез и обрезан: в ленте пометка, что показано не всё. */
  truncated: boolean
  /** Bash: потоки отдельно, чтобы stderr показать своим цветом. */
  stdout?: string | undefined
  stderr?: string | undefined
  /** Edit, MultiEdit, Write поверх существующего файла: что поменялось. */
  patch?: PatchHunk[] | undefined
  /** Строки правки по всему диффу CLI (дифф для показа может быть обрезан). */
  changeCounts?: { added: number; removed: number } | undefined
  /** Write создал файл, а не переписал существующий. */
  created?: boolean | undefined
}

/**
 * running - идёт; done и error - вернулся результат; denied - человек или правило не
 * разрешили; interrupted - ход кончился (остановили, процесс упал), а результата нет.
 */
export type ToolStatus = 'running' | 'done' | 'error' | 'denied' | 'interrupted'

/** Вход инструмента - как его прислала модель. Окно разбирает поля само по имени. */
export type ToolInput = Record<string, unknown>

type FeedItemBase = {
  id: string
  /**
   * Вызов субагента (Task / Agent), внутри которого это случилось. null - верхний
   * уровень разговора. Окно прячет такие элементы внутрь карточки субагента.
   */
  parentToolUseId: string | null
}

/**
 * Картинка в сообщении человека для ленты: только миниатюра (JPEG data URL), пустая -
 * миниатюру сделать не вышло. Рисует их телефон: под пальцем нет наведения. Окно IDE
 * показывает картинку чипом с превью под курсором (как в ACC), миниатюр не рисует. Сама
 * картинка - по запросу claude:getImage, по её номеру.
 */
export type FeedImage = { thumbnail: string }

/** Сообщение человека. */
export type UserFeedItem = FeedItemBase & {
  kind: 'user'
  text: string
  /** Когда отправлено (мс): из транскрипта или момент отправки. 0 - неизвестно. */
  time: number
  images: FeedImage[]
  /**
   * Написано посреди хода: CLI кладёт его между шагами чужого хода, чистого «до» у
   * него нет - откатываться и форкать отсюда нельзя.
   */
  steering: boolean
  /** Куски сообщения из поля (чипы, цитаты) - у отправленного из этого окна; нет - только текст. */
  draft?: MessageDraft | undefined
  /** Что было открыто в редакторе и ушло модели заметкой: строка под сообщением. */
  editor?: EditorRef | undefined
  /**
   * Написала панель, а не человек (продолжение оборванной работы): подпись PANEL с
   * причиной; unknown - причина из более новой версии, за неё не ручаемся.
   */
  auto?: CarryOnReason | 'unknown' | undefined
}

/** Текст ответа модели. Пока идёт поток, текст растёт, streaming - true. */
export type AssistantFeedItem = FeedItemBase & {
  kind: 'assistant'
  text: string
  streaming: boolean
}

/**
 * Размышления. У текущих моделей текст скрыт (пустой блок с подписью), тогда виден
 * только счёт токенов.
 */
export type ThinkingFeedItem = FeedItemBase & {
  kind: 'thinking'
  text: string
  streaming: boolean
  /** Оценка токенов размышления от CLI. 0 - неизвестно. */
  tokens: number
}

/**
 * Почему вызов закрыт без результата (как в ACC): replay - транскрипт не хранит его
 * результата; exited - процесс умер под ним; stopped - человек нажал «стоп»; turnEnded -
 * ход кончился, а вызов так и не отчитался; untracked - фоновая работа пережила процесс,
 * следить за ней больше некому; restarted - процесс заменили нарочно (аккаунт, MCP).
 */
export type ClosedReason = 'replay' | 'exited' | 'stopped' | 'turnEnded' | 'untracked' | 'restarted'

/** Вызов инструмента и его результат в одной карточке. id - tool_use_id. */
export type ToolFeedItem = FeedItemBase & {
  kind: 'tool'
  name: string
  input: ToolInput
  status: ToolStatus
  result: ToolResult | null
  /** Когда вызов начался и кончился (мс) - длительность справа в шапке. 0 - неизвестно. */
  startedAt: number
  endedAt: number
  /** У прерванного (status interrupted) - почему; иначе null. */
  closedReason: ClosedReason | null
  /** Задача CLI за вызовом (task_*): субагент, флот workflow, фоновая команда. Нет - не задача. */
  task?: CliTask | undefined
}

// --- Субагенты, флот workflow, фоновые команды (события task_* CLI) ---

/** Агент флота: в очереди, работает, готов, упал, снят рукой. */
export type FleetAgentState = 'queued' | 'running' | 'done' | 'failed' | 'skipped'

/** Агент флота workflow по отчёту CLI. Пустая строка и 0 - CLI не сказал. */
export type FleetAgent = {
  /** Номер в прогоне: по нему CLI сливает отчёт, по нему же открывают окно агента. */
  index: number
  label: string
  state: FleetAgentState
  /** Имя транскрипта агента на диске (agent-<agentId>.jsonl) - по нему читается его разговор. */
  agentId: string
  model: string
  /** Сколько шёл (мс), когда кончил; null - ещё идёт или неизвестно. */
  durationMs: number | null
  /** Когда начал (мс) - у идущего время считается от него; null - ещё в очереди. */
  startedAt: number | null
  tokens: number
  toolCalls: number
  /** Попытка, если не первая; 0 - первая. */
  attempt: number
  /** Продолженный прогон отдал его из журнала, а не гонял заново. */
  cached: boolean
  error: string
  /** Первые 400 символов задания и ответа - их режет сам CLI. */
  prompt: string
  result: string
}

/** Фаза прогона; index null - агенты вне phase(), они идут безымянной группой. */
export type FleetPhase = { index: number | null; title: string; agents: FleetAgent[] }

/** Флот workflow по последнему отчёту CLI (workflow_progress): фазы, агенты, log() скрипта. */
export type WorkflowFleet = {
  phases: FleetPhase[]
  log: string[]
  running: number
  done: number
  failed: number
  total: number
}

/** Чем кончилась задача: сама, с ошибкой, остановлена; untracked - процесс ушёл, следить некому. */
export type CliTaskOutcome = 'completed' | 'failed' | 'stopped' | 'untracked'

/**
 * Задача CLI за вызовом: субагент (Task, Agent или поднятый скиллом), флот workflow,
 * фоновая команда Bash. taskId - имя задачи у CLI, им её останавливают (stop_task).
 */
export type CliTask = {
  taskId: string
  kind: 'agent' | 'workflow' | 'command'
  /** Ушла в фон: ход её не ждёт, конец придёт уведомлением. */
  background: boolean
  /** Когда CLI сообщил начало и конец (мс); 0 - ещё не было. */
  startedAt: number
  endedAt: number
  /** Чем занята сейчас - описание из task_progress. */
  activity: string
  /**
   * Шаги из task_progress - журнал агента без своего потока (поднятого скиллом); старые
   * срезаются, сколько срезано - trimmed.
   */
  steps: string[]
  trimmed: number
  /** Флот workflow; null - отчёта ещё не было или это не workflow. */
  fleet: WorkflowFleet | null
  /** null - ещё идёт. */
  outcome: CliTaskOutcome | null
  /** Итог словами CLI (summary уведомления). */
  summary: string
}

/** Разговор агента флота с диска: задание, шаги, ответ. found false - файла нет. */
export type FleetTranscript = {
  found: boolean
  prompt: string
  steps: string[]
  output: string
  /** Ответ длиннее предела и обрезан. */
  truncated: boolean
}

/** Конец хода: сколько шёл и сколько стоил. */
/**
 * Почему откат или возврат файла не прошёл: строки хода с тех пор переписаны (changed),
 * файла, который ход правил, больше нет (missing), не прочитался или не записался (failed).
 */
export type ChangeRefusal = 'changed' | 'missing' | 'failed'

/** Файл, который поменял ход: строки и что с ним сделал человек. */
export type FileChange = {
  /** Полный путь, как у инструмента. */
  path: string
  /** Сумма по правкам хода; у созданного файла строк в нём - added минус removed. */
  added: number
  removed: number
  created: boolean
  /**
   * Цифры настоящие. false - правку посчитать нечем (CLI не прислал дифф большой правки,
   * копии нет): вместо цифр «±», кнопки нет.
   */
  counted: boolean
  /**
   * Главный процесс знает точный дифф хода по файлу: его можно откатить и вернуть.
   * Без диффа откат угадывал бы по вызову - кнопки нет.
   */
  undoable: boolean
  /** Человек откатил его (откат можно вернуть той же кнопкой). */
  reverted: boolean
  /** Отказ последнего нажатия: у откаченного - отказ возврата, файл остаётся откаченным. */
  refusal: ChangeRefusal | null
}

/** Кто остановил ход: человек (Stop) или панель ради переезда на другой аккаунт. */
export type StopReason = 'you' | 'account'

export type TurnFeedItem = FeedItemBase & {
  kind: 'turn'
  /**
   * Сколько шла работа. Ход, которым работа встала (нет хода и фоновых агентов), - время
   * всего запроса от сообщения человека без пауз на вопросы (как в ACC); промежуточный
   * ход и ход из транскрипта - цифра CLI за этот ход.
   */
  durationMs: number
  costUsd: number
  /** Ход закончился ошибкой API или лимитом, а не ответом. */
  isError: boolean
  /** Ход остановлен: человеком или панелью ради переезда на другой аккаунт. */
  interrupted: boolean
  /** Остановила панель, переводя разговор на другой аккаунт: «Stopped to switch account». */
  forAccount?: boolean | undefined
  /** Файлы, которые поменял ход, - и правками субагентов тоже. */
  changes: FileChange[]
  /**
   * Файлы хода можно откатить (те, что undoable): после этого хода ничего не написано.
   * Откат из-под следующего сообщения оставил бы агента работать по коду, которого уже
   * нет, а два живых списка один над другим читались бы как два решения.
   */
  revertable: boolean
}

/**
 * Служебная отметка в ленте. Текст из CLI (ошибка API) показывается как есть, свои
 * отметки окно переводит по коду.
 */
export type NoticeCode =
  /** Ход оборвался остановкой; detail «account» - его сняла панель ради переезда на аккаунт. */
  | 'interrupted'
  | 'start-failed'
  | 'process-exited'
  | 'cli-error'
  | 'not-logged-in'
  | 'rate-limited'
  | 'rewound'
  | 'forked'
  /**
   * Под швом форка: его просили резать по сообщению, а сообщения в транскрипте не
   * нашлось - форк несёт разговор целиком (ACC feed.forkWhole).
   */
  | 'fork-whole'
  /** /clear: всё выше разговор больше не помнит. */
  | 'cleared'
  /** /status: id разговора (detail) и команда продолжить его в терминале. */
  | 'session'
  /** Быстрый режим не включился; detail - причина кодом CLI (fast_mode_disabled_reason). */
  | 'fast'
  /** Настройки репозитория перебивают выбранный аккаунт; detail - имена через запятую. */
  | 'outranked'
  /** Строка лога мода CLI: detail - его слова, subject - имя мода. */
  | 'mod'
  /** Выбранная модель не доехала: detail - что выбрали, subject - что отвечает. */
  | 'model-stuck'
  /** Конфиг коннекторов IDE не записался: этот процесс работает без них (ADR 0029). */
  | 'connectors-missing'
  /** CLI сам перешёл на другую модель (по подписи ответа): detail - откуда, subject - куда. */
  | 'model-swap'

export type NoticeFeedItem = FeedItemBase & {
  kind: 'notice'
  code: NoticeCode
  /**
   * Подробности от CLI: текст ошибки, код выхода; у forked - имя разговора-источника, у
   * session - id разговора.
   */
  detail: string
  /** Прочитано из транскрипта, а не случилось сейчас: кнопки действий у такой записи не нужны. */
  replayed: boolean
  /** forked: id сессии источника - имя в отметке открывает его. Пусто - не известен. */
  sourceSessionId?: string | undefined
  /** Второе значение отметки: имя мода (mod), модель, которая отвечает (model-stuck, model-swap). */
  subject?: string | undefined
  /**
   * cli-error: запрос отвергнут (400) из-за параметра выборки - его добавил шлюз или
   * прокси из настроек, а не панель. Под ошибкой - объяснение.
   */
  sampling?: boolean | undefined
}

/** Необязательные поля отметки, которые ставит сборщик ленты. */
export type NoticeExtra = Pick<NoticeFeedItem, 'sourceSessionId' | 'subject' | 'sampling'>

/**
 * Сжатие контекста (CONTEXT): пока идёт - pending и процент по часам, потом «до и после».
 * trigger null - CLI не сказал, руками или сам; токены 0 - цифр нет.
 */
export type CompactFeedItem = FeedItemBase & {
  kind: 'compact'
  pending: boolean
  startedAt: number
  trigger: 'manual' | 'auto' | null
  preTokens: number
  postTokens: number
  durationMs: number
}

/** Почему запрос к API повторяется: 429, 529, вход, прочее. */
export type RetryReason = 'rateLimited' | 'overloaded' | 'auth' | 'error'

/** Чем кончились повторы: прошёл, сдался, остановлен человеком. */
export type RetryOutcome = 'recovered' | 'failed' | 'stopped'

/** Повтор запроса к API (RETRY): попытка из скольких и когда следующая. */
export type RetryFeedItem = FeedItemBase & {
  kind: 'retry'
  pending: boolean
  reason: RetryReason
  attempt: number
  /** 0 - CLI не сказал предела. */
  maxRetries: number
  /** Когда пойдёт следующая попытка (мс). */
  retryAt: number
  startedAt: number
  outcome: RetryOutcome | null
  durationMs: number
}

/** CLI сам перевёл разговор на другую модель (MODEL) - с причиной его словами. */
export type ModelSwitchFeedItem = FeedItemBase & {
  kind: 'model'
  from: string
  to: string
  reason: string
}

/** Лимит подписки (LIMIT) или работа сверх него за доплату (EXTRA USAGE). */
export type LimitFeedItem = FeedItemBase & {
  kind: 'limit'
  state: 'limit' | 'extra'
  /** Какое окно кончилось («five_hour»…); пусто - CLI не сказал. */
  window: string
  /** Когда окно сбросится (мс); 0 - неизвестно. */
  resetsAt: number
}

/** Как кончилась команда «!»: идёт, отработала (код выхода рядом), упала на запуске, остановлена. */
export type ShellStatus = 'running' | 'done' | 'failed' | 'stopped'

/**
 * Команда, которую человек запустил из поля через «!»: её выполняет панель, а не
 * агент. Модель увидит команду и вывод вместе со следующим сообщением.
 */
export type ShellFeedItem = FeedItemBase & {
  kind: 'shell'
  command: string
  status: ShellStatus
  stdout: string
  stderr: string
  /** null - процесс не дошёл до выхода (не запустился, остановлен, идёт). */
  exitCode: number | null
  /** Вывод длиннее предела: показан конец. */
  truncated: boolean
}

export type FeedItem =
  | UserFeedItem
  | AssistantFeedItem
  | ThinkingFeedItem
  | ToolFeedItem
  | TurnFeedItem
  | NoticeFeedItem
  | ShellFeedItem
  | CompactFeedItem
  | RetryFeedItem
  | ModelSwitchFeedItem
  | LimitFeedItem

export type FeedItemKind = FeedItem['kind']

export type TaskState = 'pending' | 'in_progress' | 'completed'

/** Задача из списка, который ведёт модель (TodoWrite, TaskCreate, TaskUpdate). */
export type TaskEntry = {
  id: string
  subject: string
  /** Как задача звучит, пока над ней работают: «Running tests». */
  activeForm: string
  state: TaskState
}

/** Лента целиком: ответ на запрос ленты разговора. */
export type ConversationFeed = {
  conversationId: string
  items: FeedItem[]
  tasks: TaskEntry[]
  /**
   * Выше загруженного в транскрипте есть ещё: над лентой метка «load earlier messages»
   * (страницы, claude:loadEarlier). false - начало разговора уже в ленте.
   */
  hasEarlier: boolean
}

/** Изменение ленты: новые и обновлённые элементы по id, убранные откатом. */
export type FeedPatch = {
  conversationId: string
  upserts: FeedItem[]
  /** id убранных элементов (откат разговора). */
  removes?: string[] | undefined
  /** Список задач целиком, если он поменялся. */
  tasks?: TaskEntry[] | undefined
  /** Поменялось, есть ли что подгружать выше (/clear, откат). */
  hasEarlier?: boolean | undefined
}
