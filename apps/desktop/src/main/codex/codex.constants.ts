/** Через сколько простоя гаснет процесс-каталог (модели, аккаунт, история) - как у amazing-codex. */
export const CATALOG_IDLE_MS = 2 * 60 * 1000

/**
 * Чаще этого лимиты Codex не спрашиваются: окно просит их по таймеру из каждой панели, а
 * за ходом их и так присылает сам Codex.
 */
export const USAGE_MIN_MS = 60 * 1000

/** Пачка уведомлений о лимитах - одним вопросом через столько. */
export const USAGE_NOTICE_MS = 2000

/** Сколько разговоров истории просить за раз. */
export const HISTORY_PAGE = 50

/** Сколько прошлых ходов разговора - на страницу ленты (на открытии и «раньше»). */
export const TURNS_PAGE = 10

/** Кто мы для Codex в рукопожатии app-server. */
export const CODEX_CLIENT = {
  name: 'agentic_workstation',
  title: 'Agentic Workstation',
} as const
