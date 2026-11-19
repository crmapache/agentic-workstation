import type { PanelCommandId } from './slash.types'

/** Подсказка листается сама; потолок - от бесконечного списка, а не от полного. */
export const MAX_SUGGESTIONS = 50

/**
 * Команды панели по порядку ACC. В подсказке видна только та, у которой есть действие
 * в IDE (`usePanelCommands`): обещать команду, которая ничего не сделает, нельзя.
 */
export const PANEL_COMMANDS: readonly PanelCommandId[] = [
  'resume',
  'fork',
  'login',
  'logout',
  'design-login',
  'rename',
  'config',
  'btw',
  'fast',
  'status',
]

/** Синтаксис аргумента команд панели - серым в поле после имени. */
export const PANEL_ARGUMENTS: Partial<Record<PanelCommandId, string>> = {
  rename: '[new name]',
  btw: '<question>',
  fast: '[on|off]',
}

/**
 * Встроенные команды провайдеров, описанные заранее: видны и до первого хода. Какие из них
 * у панели - говорит провайдер (capabilities.commands), модель и усилие - у всех.
 */
export const BUILTIN_COMMANDS = [
  'model',
  'effort',
  'context',
  'cost',
  'usage',
  'code-review',
  'compact',
  'review',
] as const

export type BuiltinCommandId = (typeof BUILTIN_COMMANDS)[number]

/** Встроенные, которые выполняет сама панель (выбор модели и усилия), - у любого провайдера. */
export const LOCAL_BUILTINS: ReadonlySet<BuiltinCommandId> = new Set(['model', 'effort'])

/** Синтаксис встроенных команд, где он есть (code-review - сверено с бинарником в ACC). */
export const BUILTIN_ARGUMENTS: Partial<Record<BuiltinCommandId, string>> = {
  'code-review': '[low|medium|high|xhigh|max|ultra] [--fix] [--comment] [<target>]',
  review: '[what to look at]',
}

/**
 * Команды, которые CLI в режиме потока не выполняет, а честно отказывает, и запуск флота,
 * присланный сервером (только в сессиях, поднятых сервером): показывать их в подсказке -
 * обещать отказ. Служебные с «__» в начале не показываются тоже (`isOffered`).
 */
export const UNAVAILABLE_IN_STREAM: ReadonlySet<string> = new Set([
  'export',
  'permissions',
  'status',
  'workflow-launch-exec',
])

/** Начало имени служебной команды CLI (`__remote-workflow`): человеку её не набирать. */
export const INTERNAL_COMMAND_PREFIX = '__'

/** Значение «как в настройках CLI» у /model и /effort. */
export const DEFAULT_ARGUMENT = 'default'
