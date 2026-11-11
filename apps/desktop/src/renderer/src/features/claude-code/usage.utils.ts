import type { TFunction } from 'i18next'

import type { UsageWindow, AccountUsage } from '@shared/claude-usage'

import type { RingMeterTone } from '@agentic-workstation/ui/RingMeter.types'

import { DAY_MS, HOUR_MS, MINUTE_MS } from './claude.constants'
import type { UsageRing } from './claude.types'
import {
  WEEK_MS,
  FIVE_HOUR_MS,
  PACE_HIGH_OVER,
  PACE_FULL_PERCENT,
  PACE_HIGH_PERCENT,
  PACE_WARNING_OVER,
  WEEK_DAILY_BUDGET,
  USAGE_FULL_PERCENT,
  USAGE_DANGER_PERCENT,
  USAGE_WARNING_PERCENT,
} from './usage.constants'

/** Процент окна сейчас: сброс уже прошёл - окно новое и пустое, а не вчерашнее. */
export const windowPercent = (window: UsageWindow, now: number): number =>
  window.resetsAt !== null && window.resetsAt <= now ? 0 : window.percent

/**
 * Ступень шкалы окна: уровень от сервера, а если он молчит - по проценту. В запасе -
 * первая ступень лестницы, как у контекста и колец: всё, что показывает уровень,
 * приглушает режим спокойных цветов.
 */
export const usageTone = (percent: number, severity: string): 'success' | 'warning' | 'danger' => {
  if (severity === 'critical' || percent >= USAGE_DANGER_PERCENT) return 'danger'
  if (severity === 'warning' || percent >= USAGE_WARNING_PERCENT) return 'warning'

  return 'success'
}

/** Окно всего тарифа (пять часов, неделя), а не одной модели: оно останавливает работу целиком. */
const isPlanWide = (window: UsageWindow) =>
  window.model === '' && (window.group === 'session' || window.group === 'weekly')

/** Подпись окна: «5-hour», «Week», «Week · Fable». */
export const windowLabel = (window: UsageWindow, t: TFunction): string => {
  if (window.group === 'session') return t('claudeCode.usage.session')
  if (window.group === 'weekly' && window.model) {
    return t('claudeCode.usage.weeklyModel', { model: window.model })
  }
  if (window.group === 'weekly') return t('claudeCode.usage.weekly')

  return window.model ? `${window.group} · ${window.model}` : window.group
}

/** Сколько осталось: «3d 4h», «2h 05m», «12m». Меньше минуты - минута: часы тикают раз в 30 с. */
export const formatRemaining = (ms: number): string => {
  const pad = (value: number) => String(value).padStart(2, '0')

  if (ms >= DAY_MS) return `${Math.floor(ms / DAY_MS)}d ${Math.floor((ms % DAY_MS) / HOUR_MS)}h`
  if (ms >= HOUR_MS) {
    return `${Math.floor(ms / HOUR_MS)}h ${pad(Math.floor((ms % HOUR_MS) / MINUTE_MS))}m`
  }

  return `${Math.max(1, Math.ceil(ms / MINUTE_MS))}m`
}

/** Самое занятое окно тарифа - его процент стоит на индикаторе у поля. */
export const busiestWindow = (usage: AccountUsage, now: number): UsageWindow | null =>
  usage.windows
    .filter(isPlanWide)
    .reduce<UsageWindow | null>(
      (best, window) =>
        best && windowPercent(best, now) >= windowPercent(window, now) ? best : window,
      null,
    )

/**
 * Когда аккаунт снова примет работу: окно тарифа упёрлось - его сброс, упёрлись оба -
 * поздний. Идёт доплата - аккаунт работает и ничего не ждёт; сброс не назван - null.
 */
export const availableAgainAt = (usage: AccountUsage, now: number): number | null => {
  if (usage.extra) return null

  const resets = usage.windows
    .filter((window) => isPlanWide(window) && windowPercent(window, now) >= USAGE_FULL_PERCENT)
    .map((window) => window.resetsAt)

  if (resets.length === 0 || resets.some((reset) => reset === null)) return null

  return Math.max(...resets.filter((reset) => reset !== null))
}

/** Ступени лестницы колец: в запасе, быстрее нормы, заметно быстрее, тревога. */
const PACE_TONES: readonly RingMeterTone[] = ['success', 'warning', 'high', 'danger']

/**
 * Тон кольца по темпу, а не по голому проценту (как в ACC): 51% недели в её последний
 * день не страшен, а в первый - тревожен. Расход сравнивается с линией ровного темпа до
 * сброса; у самого предела тревога в любом случае. Сброс не назван или прошёл - только
 * предел.
 */
export const paceTone = (
  percent: number,
  resetsAt: number | null,
  windowMs: number,
  now: number,
): RingMeterTone => {
  const ceiling = percent >= PACE_FULL_PERCENT ? 3 : percent >= PACE_HIGH_PERCENT ? 2 : 0

  if (resetsAt === null || resetsAt <= now) return PACE_TONES[ceiling] ?? 'success'

  const elapsed = Math.min(1, Math.max(0, (now - (resetsAt - windowMs)) / windowMs))
  const over = percent - elapsed * 100
  const byPace = over <= 0 ? 0 : over <= PACE_WARNING_OVER ? 1 : over <= PACE_HIGH_OVER ? 2 : 3

  return PACE_TONES[Math.max(byPace, ceiling)] ?? 'success'
}

/**
 * Сколько недели «положено» израсходовать к сегодняшнему дню: бледная дуга под яркой.
 * Пока яркая короче - идём по плану. Сброс не назван - темпа нет.
 */
export const weekBudget = (resetsAt: number | null, now: number): number | null => {
  if (resetsAt === null) return null

  const day = Math.floor(Math.max(0, now - (resetsAt - WEEK_MS)) / DAY_MS) + 1

  return Math.min(day * WEEK_DAILY_BUDGET, USAGE_FULL_PERCENT)
}

/**
 * Кольца лимитов в порядке окон сервера (как в ACC: пять часов, неделя, неделя модели).
 * Тон - по темпу до сброса, у недель - бледная дуга ровного темпа; у окна, чью длину
 * панель не знает, - только по пределу. Окно, которое упёрлось, пока идёт доплата, -
 * горящее кольцо без цифры: его процент застрял на ста и ничего не говорит.
 */
export const usageRings = (usage: AccountUsage, now: number, t: TFunction): UsageRing[] =>
  usage.windows.map((window) => {
    const session = window.group === 'session'
    const isWeek = window.group === 'weekly'
    const span = session ? FIVE_HOUR_MS : isWeek ? WEEK_MS : null
    const value = windowPercent(window, now)
    const pace = isWeek ? weekBudget(window.resetsAt, now) : null
    const left = window.resetsAt !== null ? window.resetsAt - now : 0
    const label = windowLabel(window, t)
    const lines = [
      t('claudeCode.usage.ringHint', { label, value: Math.round(value) }),
      left > 0 ? t('claudeCode.usage.resetsIn', { time: formatRemaining(left) }) : '',
      pace !== null ? t('claudeCode.usage.paceBudget', { value: pace }) : '',
    ]

    return {
      key: `${window.group}:${window.model}`,
      label,
      value,
      pace,
      tone: paceTone(value, span === null ? null : window.resetsAt, span ?? WEEK_MS, now),
      burning: usage.extra !== null && value >= USAGE_FULL_PERCENT,
      hint: lines.filter(Boolean).join(' · '),
    }
  })
