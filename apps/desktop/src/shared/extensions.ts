/**
 * Расширения IDE (ADR 0091): папка с манифестом и ES-модулем, исполняется в песочнице QuickJS
 * главного процесса и меняет IDE только через объявленные ручки. Плагины Claude Code - другое
 * (`claude-tools.ts`), отсюда и имя: Extensions.
 */

/**
 * Права расширения сверх своего угла. Без прав расширение уже может: команды, свои виды,
 * строка состояния, уведомления, диалоги, тема, своё хранилище и настройки, таймеры, журнал.
 */
export type ExtensionPermission =
  | 'files.read'
  | 'files.write'
  | 'agent.observe'
  | 'agent.intercept'
  | 'ide.control'
  | 'ai.tools'
  | 'network'
  | 'shell'
  | 'clipboard'

export const EXTENSION_PERMISSIONS: readonly ExtensionPermission[] = [
  'files.read',
  'files.write',
  'agent.observe',
  'agent.intercept',
  'ide.control',
  'ai.tools',
  'network',
  'shell',
  'clipboard',
]

/**
 * Насколько право опасно - так его и показывает окно одобрения: high - меняет проекты, разговоры
 * ИИ или запускает программы; medium - читает чужое или говорит с сетью.
 */
/** Насколько право опасно: так его подписывает окно одобрения. */
export type PermissionRisk = 'low' | 'medium' | 'high'

export const PERMISSION_RISK: Record<ExtensionPermission, PermissionRisk> = {
  'files.read': 'medium',
  'files.write': 'high',
  'agent.observe': 'medium',
  'agent.intercept': 'high',
  'ide.control': 'high',
  'ai.tools': 'medium',
  network: 'medium',
  shell: 'high',
  clipboard: 'medium',
}

/**
 * Права с рамками: какие права, на какие адреса сети (`api.github.com`, `*.example.com`) и какие
 * программы. Так выглядит и просьба манифеста, и то, что выдал человек.
 */
export type ExtensionGrant = {
  permissions: ExtensionPermission[]
  hosts: string[]
  commands: string[]
}

export const EMPTY_GRANT: ExtensionGrant = { permissions: [], hosts: [], commands: [] }

/** Поле настроек расширения: форму рисует IDE, секрет живёт в хранилище ключей. */
export type ExtensionSettingField =
  | {
      key: string
      type: 'text' | 'secret'
      label: string
      description?: string | undefined
      placeholder?: string | undefined
      default?: string | undefined
    }
  | {
      key: string
      type: 'switch'
      label: string
      description?: string | undefined
      default?: boolean | undefined
    }
  | {
      key: string
      type: 'select'
      label: string
      description?: string | undefined
      options: { value: string; label: string }[]
      default?: string | undefined
    }

/** Значение настройки в окне: у секрета - только «задан ли». */
export type ExtensionSettingValue = string | boolean | { secret: boolean }

/** Манифест `extension.json`, проверенный главным процессом. */
export type ExtensionManifest = {
  id: string
  name: string
  version: string
  description: string
  /** Имя иконки lucide (`Puzzle`, `GitBranch`); незнакомое окно заменит своей. */
  icon: string
  main: string
  apiVersion: 1
  /** Что расширение просит. */
  requests: ExtensionGrant
  settings: ExtensionSettingField[]
}

/**
 * Где расширение сейчас. invalid - манифест не прочитан; needsApproval - просит шире выданного;
 * failed - упало (ошибка в коде, срок, память); disabled - выключил человек.
 */
export type ExtensionStatus =
  'starting' | 'running' | 'stopped' | 'disabled' | 'needsApproval' | 'failed' | 'invalid'

/**
 * Почему не работает. Текст detail - слова движка или самого расширения (сообщение исключения),
 * показываются как есть, как ответ git.
 */
export type ExtensionProblemCode = 'manifest' | 'load' | 'crash' | 'timeout' | 'memory' | 'engine'

export type ExtensionProblem = { code: ExtensionProblemCode; detail: string }

/** Команда расширения: в поиске действий (⌘⇧A) и на клавишах, если они свободны. */
export type ExtensionCommand = {
  /** Ключ на всю IDE: `<расширение>.<команда>`. */
  key: string
  title: string
  keys: string | null
}

/** Где стоит вид расширения: середина окна (зона 6) или левая панель (зона 5). */
export type ExtensionViewPlace = 'main' | 'side'

/** Вид расширения: своя иконка в полосе видов, содержимое - дерево ExtensionUiNode. */
export type ExtensionView = {
  key: string
  title: string
  icon: string
  place: ExtensionViewPlace
  /** Сколько показать на иконке, 0 - ничего. */
  badge: number
}

/** Пункт строки состояния: подпись и подсказка, нажатие - команда расширения. */
export type ExtensionStatusItem = {
  key: string
  text: string
  icon: string | null
  tooltip: string | null
  command: string | null
}

/** Инструмент расширения для ИИ: под каким именем он в коннекторе extensions. */
export type ExtensionToolInfo = { name: string; title: string; readOnly: boolean }

/** Хуки разговоров, на которые расширение подписано. */
export type ExtensionHook = 'beforeSend' | 'turnEnd' | 'guard' | 'fileSaved'

/** Что расширение сейчас вносит в IDE. Пустое у остановленного. */
export type ExtensionContributions = {
  commands: ExtensionCommand[]
  views: ExtensionView[]
  statusItems: ExtensionStatusItem[]
  tools: ExtensionToolInfo[]
  hooks: ExtensionHook[]
}

export const NO_CONTRIBUTIONS: ExtensionContributions = {
  commands: [],
  views: [],
  statusItems: [],
  tools: [],
  hooks: [],
}

/** Расширение, как его видит окно. */
export type ExtensionInfo = {
  id: string
  /** Абсолютный путь папки расширения. */
  dir: string
  manifest: ExtensionManifest | null
  status: ExtensionStatus
  problem: ExtensionProblem | null
  granted: ExtensionGrant | null
  /** Чего не хватает до просьбы манифеста: это и показывает окно одобрения. */
  missing: ExtensionGrant
  contributions: ExtensionContributions
  settings: Record<string, ExtensionSettingValue>
  /** Записей журнала уровня error с последнего запуска. */
  errors: number
  /** Поставлено из магазина: какой версии и чьё; своё (папка человека) - null. */
  source: { version: string; publisher: string } | null
}

/** Состояние расширений целиком: корень папок и все найденные. */
export type ExtensionsState = {
  root: string
  extensions: ExtensionInfo[]
  /** Тема от расширений: токены по порядку расширений, позднее - главнее. */
  theme: Record<string, string>
}

/** Запись журнала расширения: console.* и сообщения движка. */
export type ExtensionLogEntry = {
  at: number
  level: 'log' | 'info' | 'warn' | 'error'
  text: string
}

/** Что человек просит у ИИ, создавая расширение. */
export type ExtensionDraftRequest = {
  name: string
  request: string
  provider: string
}

/**
 * Причина отказа действия с расширением - словами окна. chat-only - провайдер работает только в
 * своём чате (ADR 0094), а разговор с ИИ над расширением начинает IDE своим первым сообщением.
 */
export type ExtensionActionError =
  'not-found' | 'exists' | 'invalid-name' | 'io' | 'no-provider' | 'chat-only'

/** Ответ на действие с расширениями: новое состояние целиком или причина отказа. */
export type ExtensionsActionResult =
  | { ok: true; state: ExtensionsState }
  | { ok: false; error: ExtensionActionError; state: ExtensionsState }
