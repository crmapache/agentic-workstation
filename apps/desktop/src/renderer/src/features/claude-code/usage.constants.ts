import { DAY_MS, HOUR_MS, MINUTE_MS, SECOND_MS } from '@shared/time-units'

/** С какого процента окно предупреждает и тревожит, если сервер не назвал уровень сам. */
export const USAGE_WARNING_PERCENT = 70
export const USAGE_DANGER_PERCENT = 90

/** Окно упёрлось: дальше работа идёт только на доплате. */
export const USAGE_FULL_PERCENT = 100

/**
 * Как часто окно просит освежить лимиты: экран аккаунтов - пока открыт, индикатор у
 * поля - всё время. Главный процесс всё равно спрашивает каждый аккаунт не чаще своего
 * шага, так что просьба ничего не стоит.
 */
export const ACCOUNTS_USAGE_REFRESH_MS = MINUTE_MS
export const PANEL_USAGE_REFRESH_MS = 2 * MINUTE_MS

/** Как часто тикают часы «сброс через»: время на экране - в минутах. */
export const USAGE_TICK_MS = 30 * SECOND_MS

/** Цифры старше этого подписываются, когда их сняли: сервер давно не отвечал. */
export const USAGE_STALE_MS = 10 * MINUTE_MS

/** Длина окон тарифа: по ней считается ровный темп до сброса. */
export const FIVE_HOUR_MS = 5 * HOUR_MS
export const WEEK_MS = 7 * DAY_MS

/** Сколько недельного окна «положено» на день при ровном темпе (14% - чтобы к седьмому остался запас). */
export const WEEK_DAILY_BUDGET = 14

/**
 * Насколько процентов расход обогнал ровный темп - ступени лестницы колец: до нуля - в
 * запасе, до 15 - быстрее нормы, до 35 - заметно быстрее, дальше - тревога.
 */
export const PACE_WARNING_OVER = 15
export const PACE_HIGH_OVER = 35

/** У самого предела время уже не спасает: 90 и 96 процентов - ступени независимо от темпа. */
export const PACE_HIGH_PERCENT = 90
export const PACE_FULL_PERCENT = 96
