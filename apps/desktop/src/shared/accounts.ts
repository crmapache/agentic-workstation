import type { AccountUsage } from './account-usage'
import type { AccountCapability } from './panel-extras'

/**
 * Аккаунты панели провайдера (ADR 0009, 0083). У Claude аккаунт - отдельное хранилище входа
 * CLI (`CLAUDE_SECURESTORAGE_CONFIG_DIR`): транскрипты, настройки, MCP и плагины общие, свой
 * только вход; пустой id - обычный вход Claude Code на этой машине. У Codex - своя папка
 * `CODEX_HOME`, у открытых моделей вместо аккаунтов подключения.
 */
export type ClaudeAccount = {
  id: string
  /** Имя, которое дал человек; пусто - окно покажет почту или «вход по умолчанию». */
  alias: string
  email: string
  /** Тариф словами CLI: max, pro, team. */
  plan: string
  /** Вошёл ли CLI с этим хранилищем; null - ещё не спрашивали. */
  signedIn: boolean | null
  /** Хранилище заведено в amazing-claude-code: забыть его здесь - не удалять там. */
  external: boolean
}

/** Аккаунт из amazing-claude-code, который можно взять сюда без повторного входа. */
export type ImportableAccount = { sourceId: string; alias: string; email: string; plan: string }

export type AccountsState = {
  /** Выбранный аккаунт: на нём идут все разговоры. */
  current: string
  accounts: ClaudeAccount[]
  importable: ImportableAccount[]
  /**
   * Вход идёт в Терминале: id аккаунта (новый - его черновик). Панель ждёт, пока CLI
   * скажет «вошёл».
   */
  signingIn: string | null
  /** Чем кончилось последнее действие со входом - плашкой на экране. */
  lastOutcome: AccountOutcome | null
  /** Лимиты по id аккаунта; нет записи - ещё не узнали или не вошёл. */
  usage: Record<string, AccountUsage>
  /** Умеет ли CLI держать два входа порознь; нет - ещё не спрашивали. */
  capability?: AccountCapability | undefined
  /**
   * Лимит отказал аккаунту до этого момента (мс): работа на нём встанет снова, на
   * другом пойдёт сразу. Нет записи - отказа не было или он прошёл.
   */
  refusedUntil?: Record<string, number> | undefined
}

/**
 * landed - вошли; timeout - не дождались входа; twin - такой аккаунт уже есть;
 * cancelled - человек отменил; open-failed - Терминал не открылся; logout-failed -
 * выйти не вышло, вход жив; design-no-account - аккаунт в работе не нашёлся, вход в
 * Claude Design некуда класть.
 */
export type AccountOutcome =
  | 'landed'
  | 'timeout'
  | 'twin'
  | 'cancelled'
  | 'open-failed'
  | 'logout-failed'
  | 'design-no-account'
