import type { GoalLife, GoalWait, GoalWatch, GoalSettings } from '@shared/goals'
import type { TaskRun, TaskFailure } from '@shared/tasks'
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@shared/time-units'

/**
 * Часы поручений (ADR 0080): когда проверять сторожа, когда будить и когда поручению пора
 * кончаться. Чистые функции: решения проверяет тест, а не живой сон на сутки.
 */

/** Чаще этого инструмент не дёргается: сервисы не любят опрос раз в минуту. */
export const MIN_TOOL_EVERY_MIN = 2

/** Дешёвая модель - не чаще раза в четверть часа: она всё же стоит денег. */
export const MIN_LOOK_EVERY_MIN = 15

export const MAX_EVERY_MIN = 24 * 60

export const DEFAULT_TOOL_EVERY_MIN = 10

export const DEFAULT_LOOK_EVERY_MIN = 60

/** Тишина растягивает проверку не больше чем вчетверо и не реже раза в 6 часов. */
const QUIET_FACTOR_MAX = 4
const QUIET_GAP_MAX_MS = 6 * HOUR_MS

/** Сторож, который не прошёл столько раз подряд, будит рабочую модель: пусть чинит или меняет. */
export const WATCH_FAILURES_WAKE = 5

/** Сколько раз за день можно будить рабочую модель: больше - петля, а не работа. */
export const WAKES_PER_DAY = 24

/** Подряд поднятых заново (после закрытой IDE, сбоя хода) - дальше человек решает сам. */
export const RETRIES_MAX = 3

/** Через сколько пробовать снова после сбоя хода (лимит, сеть). */
export const RETRY_AFTER_MS = 15 * MINUTE_MS

/**
 * Контекст, после которого пробуждение начинает новую главу с журналом, а не поднимает всю
 * историю: после часов сна кэша нет, и каждое пробуждение оплачивало бы историю почти целиком.
 */
export const CHAPTER_TOKENS = 60_000

/**
 * Через сколько проверять сторожа снова: его шаг, а каждые сутки тишины - ещё шаг сверху. Шаг
 * больше потолка тишины не урезается: модель сама просила реже.
 */
export const checkGap = (watch: Pick<GoalWatch, 'everyMin' | 'changedAt'>, now: number) => {
  const base = watch.everyMin * MINUTE_MS
  const quietDays = Math.max(0, Math.floor((now - watch.changedAt) / DAY_MS))
  const stretched = base * Math.min(QUIET_FACTOR_MAX, 1 + quietDays)

  return Math.max(base, Math.min(stretched, QUIET_GAP_MAX_MS))
}

/** Проверка не прошла: следующая - позже на столько шагов, сколько провалов подряд. */
export const failureGap = (
  watch: Pick<GoalWatch, 'everyMin' | 'changedAt' | 'failures'>,
  now: number,
) => Math.min(checkGap(watch, now) * (1 + watch.failures), QUIET_GAP_MAX_MS * 2)

/** Сторожа, чья проверка пришла. */
export const dueWatches = (wait: GoalWait, now: number): GoalWatch[] =>
  wait.watches.filter((watch) => watch.nextAt <= now)

/** Пришёл срок, назначенный моделью. */
export const isTimeUp = (wait: GoalWait, now: number): boolean =>
  wait.until > 0 && wait.until <= now

/** Ближайшая проверка сторожей; 0 - сторожей нет. */
export const nextCheckOf = (wait: GoalWait | null): number =>
  wait && wait.watches.length > 0 ? Math.min(...wait.watches.map((watch) => watch.nextAt)) : 0

/** Местный день YYYY-MM-DD: счёт пробуждений за день. */
export const dayOf = (now: number): string => {
  const date = new Date(now)
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Пробуждений сегодня - с учётом того, что день мог смениться. */
export const wakesToday = (life: Pick<GoalLife, 'wakeDay' | 'wakesToday'>, now: number) =>
  life.wakeDay === dayOf(now) ? life.wakesToday : 0

/**
 * Можно ли тратить на поручение дальше: срок жизни от начала (или от продолжения человеком),
 * потолок денег на работу и проверки, пробуждения за день. null - можно.
 */
export const limitOf = (
  settings: GoalSettings,
  run: Pick<TaskRun, 'costUsd'>,
  life: Pick<GoalLife, 'checksUsd' | 'since' | 'wakeDay' | 'wakesToday'>,
  now: number,
  waking: boolean,
): Extract<TaskFailure, 'overBudget' | 'wakeLimit' | 'expired'> | null => {
  if (now - life.since > settings.lifeDays * DAY_MS) return 'expired'
  if (run.costUsd + life.checksUsd >= settings.budgetUsd) return 'overBudget'
  if (waking && wakesToday(life, now) >= WAKES_PER_DAY) return 'wakeLimit'

  return null
}
