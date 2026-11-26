/**
 * Слои настроек Claude Code и его собственные настройки (`/config`) - то, что панель
 * показывает на экранах Claude Code settings и New chats. Значения переменных окружения
 * сюда не попадают никогда: только имена.
 */

/** Слой, который держит настройку сильнее того, куда пишет `/config`. */
export type ConfigLockLayer = 'policy' | 'local' | 'project'

/** Группа экрана: что меняет работу разговоров, что рисует только терминал, прочее. */
export type ConfigGroup = 'work' | 'terminal' | 'other'

export const CONFIG_GROUPS: readonly ConfigGroup[] = ['work', 'terminal', 'other']

/** Настройка Claude Code, как её показывает экран. */
export type ClaudeConfigSetting = {
  /** Ключ `/config`: «autoCompact». */
  key: string
  /** Варианты из справки CLI; у свободного значения - пусто. */
  options: string[]
  /** Любое значение одной строкой (язык ответов). */
  free: boolean
  /** Действующее значение; null - неизвестно, решает сам CLI. */
  value: string | null
  group: ConfigGroup
  /** Слой сильнее того, куда пишет `/config`, держит настройку: правка здесь не победит. */
  lockedBy: ConfigLockLayer | null
  /** `/config` пишет её в локальные настройки проекта: действует только здесь. */
  projectOnly: boolean
}

/** Почему списка нет: CLI не нашёлся или ответил тем, что экран не разбирает. */
export type ClaudeConfigFailure = 'cli-not-found' | 'unreadable'

/**
 * Как прошла правка - по перечитанному файлу, а не по фразе CLI. message - слова CLI
 * (ключи замаскированы); пусто - отказ самой панели (занято, не тот ключ).
 */
export type ClaudeConfigOutcome = { key: string; ok: boolean; message: string }

export type ClaudeConfigView = {
  settings: ClaudeConfigSetting[]
  failure: ClaudeConfigFailure | null
  /** Исход правки, на которую это ответ; у простого списка - null. */
  outcome: ClaudeConfigOutcome | null
}

/** Что файлы настроек проекта значат для панели - читается при открытии экрана. */
export type ProjectClaudeSettings = {
  /** Режим без вопросов запрещён одним из слоёв настроек, которые проект читает. */
  bypassDisabled: boolean
}
