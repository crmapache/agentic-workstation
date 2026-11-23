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

/** Значение «как в настройках CLI» у /model и /effort. */
export const DEFAULT_ARGUMENT = 'default'
