import type { ParseKeys } from 'i18next'

import type { NoticeCode, StopReason, RetryReason, RetryOutcome } from '@shared/conversation-feed'

/** Часы процента компакта и отсчёта повтора. */
export const COMPACT_TICK_MS = 500
export const RETRY_TICK_MS = 1000
export const LIMIT_TICK_MS = 10_000

/**
 * Процент компакта - по часам, а не по работе (CLI говорит только «начал» и «кончил»):
 * та же кривая насыщения, что у терминального Claude Code, с потолком - чтобы счётчик не
 * дошёл до 100 раньше самого компакта.
 */
export const COMPACT_TIME_CONSTANT_S = 90
export const COMPACT_CEILING_PERCENT = 95

export const RETRY_REASON_KEYS: Record<RetryReason, ParseKeys> = {
  rateLimited: 'agentPanel.notice.retry.reason.rateLimited',
  overloaded: 'agentPanel.notice.retry.reason.overloaded',
  auth: 'agentPanel.notice.retry.reason.auth',
  error: 'agentPanel.notice.retry.reason.error',
}

export const RETRY_OUTCOME_KEYS: Record<RetryOutcome, ParseKeys> = {
  recovered: 'agentPanel.notice.retry.recovered',
  failed: 'agentPanel.notice.retry.failed',
  stopped: 'agentPanel.notice.retry.stopped',
}

/** Причины, по которым быстрый режим не включился, - кодами CLI. */
export const FAST_REASON_KEYS: Record<string, ParseKeys> = {
  extra_usage_disabled: 'agentPanel.notice.fast.reasons.extraUsageDisabled',
  free: 'agentPanel.notice.fast.reasons.free',
  preference: 'agentPanel.notice.fast.reasons.preference',
  network_error: 'agentPanel.notice.fast.reasons.networkError',
  not_first_party: 'agentPanel.notice.fast.reasons.notFirstParty',
  disabled_by_env: 'agentPanel.notice.fast.reasons.disabledByEnv',
  model_not_allowed: 'agentPanel.notice.fast.reasons.modelNotAllowed',
  not_served: 'agentPanel.notice.fast.reasons.notServed',
}

/** Окна лимита по имени CLI: остальные называются как есть. */
export const LIMIT_WINDOW_KEYS: Record<string, ParseKeys> = {
  five_hour: 'agentPanel.notice.limit.windows.fiveHour',
  seven_day: 'agentPanel.notice.limit.windows.weekly',
  seven_day_opus: 'agentPanel.notice.limit.windows.weeklyOpus',
  seven_day_sonnet: 'agentPanel.notice.limit.windows.weeklySonnet',
}

/** Подробность отметки «прервано»: ход сняла панель ради переезда на другой аккаунт. */
export const ACCOUNT_STOP: StopReason = 'account'

/** Заголовки красной плашки у сбоев, которые панель узнаёт; прочие - только текст CLI. */
export const ERROR_TITLE_KEYS: Partial<Record<NoticeCode, ParseKeys>> = {
  'start-failed': 'agentPanel.notice.startFailed',
  'not-logged-in': 'agentPanel.notice.notLoggedIn',
  'quota-exhausted': 'agentPanel.notice.quotaExhausted',
  'terms-blocked': 'agentPanel.notice.termsBlocked',
}
