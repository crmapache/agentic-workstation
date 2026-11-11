/**
 * Плагины Claude Code - экран панели; плагины меняют разовые команды CLI. MCP у Claude в
 * IDE своего экрана нет: это коннекторы IDE (ADR 0029).
 */

/**
 * Почему список или действие не вышли - кодом, слова у окна. untrusted, cli-not-found,
 * project-missing - причины разговора; process-exited - процесс CLI закрылся, не
 * ответив; refused - CLI отказал (его текст - в detail); failed - прочее.
 */
export const TOOLS_FAILURES = [
  'untrusted',
  'cli-not-found',
  'project-missing',
  'process-exited',
  'refused',
  'failed',
] as const

export type ToolsFailure = (typeof TOOLS_FAILURES)[number]

/**
 * Итог действия с плагином: удалось ли, почему нет и что сказал CLI.
 * needsConsent - установка запускает команду маркетплейса и ждёт явного согласия
 * (флаг --yes).
 */
export type ToolsResult = {
  ok: boolean
  failure: ToolsFailure | null
  /** Текст CLI, ключи замаскированы: при успехе - его отчёт, при отказе - ошибка. */
  detail: string
  needsConsent: boolean
}

/** Области плагинов: `claude plugin … -s`. */
export const PLUGIN_SCOPES = ['user', 'project', 'local', 'managed'] as const

export type PluginScope = (typeof PLUGIN_SCOPES)[number]

export type InstalledPlugin = {
  id: string
  name: string
  marketplace: string
  version: string
  /** Пусто - CLI назвал область, которой панель не знает. */
  scope: PluginScope | ''
  enabled: boolean
}

export type AvailablePlugin = {
  id: string
  name: string
  marketplace: string
  description: string
  installCount: number
}

/** Маркетплейс: имя и откуда он - без логина и токена из адреса частного репозитория. */
export type Marketplace = { name: string; source: string }

export type PluginCatalog = {
  installed: InstalledPlugin[]
  /** Каталог маркетплейсов: самые устанавливаемые первыми. */
  available: AvailablePlugin[]
  marketplaces: Marketplace[]
  /** Почему каталог не прочитался; текст CLI - в detail. */
  failure: ToolsFailure | null
  detail: string
}

/** Действие с плагинами и каталог после него. */
export type PluginsOutcome = { result: ToolsResult; catalog: PluginCatalog }

export type PluginAction = 'install' | 'uninstall' | 'enable' | 'disable' | 'update'
