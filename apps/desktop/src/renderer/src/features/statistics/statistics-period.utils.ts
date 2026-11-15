import type { StatsPeriod, StatsReport } from '@shared/statistics'

import { PERIOD_DAYS, COMPARE_STEP_MS } from './statistics.constants'
import type { Delta, PeriodKind, StatisticsRange } from './statistics.types'

/**
 * Периоды и сравнение. Границы дней - по местному времени: их считает окно (главный процесс
 * получает готовые миллисекунды). Сутки при переводе часов бывают по 23 и 25 часов, поэтому
 * дни прибавляются календарём, а не умножением.
 */

/** Местная полночь дня, в котором лежит момент. */
export const startOfDay = (ms: number): number => {
  const date = new Date(ms)

  date.setHours(0, 0, 0, 0)

  return date.getTime()
}

/** Местная полночь через days дней от полуночи day (отрицательное - назад). */
export const addDays = (day: number, days: number): number => {
  const date = new Date(day)

  date.setDate(date.getDate() + days)

  return date.getTime()
}

/**
 * Период вида [from, to) по последний день включительно. Конец - всегда полночь после него:
 * сегодняшний график - все 24 часа, а не столько, сколько уже прошло. Выбранный день не
 * позже сегодня (null - сегодня); «всё время» - с начала эпохи по сегодня (главный процесс
 * рисует график с первого дня данных), выбранный день его не двигает.
 */
export const rangeOf = (kind: PeriodKind, now: number, picked: number | null): StatisticsRange => {
  const today = startOfDay(now)
  const lastDay = kind === 'all' || picked === null || picked >= today ? today : picked
  const to = addDays(lastDay, 1)
  const from = kind === 'all' ? 0 : addDays(lastDay, 1 - PERIOD_DAYS[kind])

  return { period: { from, to }, today, lastDay }
}

/**
 * Последний день соседнего периода: стрелки шагают на его длину (день, 7 и 30 дней). Дошли
 * до сегодня или дальше - null: период снова по сегодня и сам переходит на новый день.
 */
export const steppedLastDayOf = (
  kind: Exclude<PeriodKind, 'all'>,
  range: StatisticsRange,
  direction: -1 | 1,
): number | null => {
  const next = addDays(range.lastDay, direction * PERIOD_DAYS[kind])

  return next >= range.today ? null : next
}

/** День из календаря - последний день периода; сегодня и позже - null, период по сегодня. */
export const pickedLastDayOf = (day: number, today: number): number | null =>
  day >= today ? null : startOfDay(day)

/** Раньше периода есть данные - назад листать есть куда. */
export const hasEarlierOf = (range: StatisticsRange, dataStart: number | null): boolean =>
  dataStart !== null && dataStart < range.period.from

/** «Сейчас» с точностью до шага сравнения: ключ запроса меняется раз в несколько минут. */
export const compareMomentOf = (now: number): number =>
  Math.floor(now / COMPARE_STEP_MS) * COMPARE_STEP_MS

/**
 * Честное сравнение: прошлый период той же длины, но только до того места, до которого
 * дошёл текущий. Сегодня в 15:00 сравнивается со вчера до 15:00, а не со вчера целиком -
 * иначе каждое утро выглядело бы провалом. asOf - «сейчас» (compareMomentOf).
 */
export const comparablePeriodOf = (period: StatsPeriod, asOf: number): StatsPeriod => {
  const length = period.to - period.from
  const reached = Math.min(period.to, Math.max(period.from, asOf))

  return { from: period.from - length, to: reached - length }
}

/**
 * Присутствие и код руками копятся с выпуска статистики, позже агентских чисел. Сравнивать
 * их честно, только если прошлый период целиком после их начала.
 */
export const isHumanComparable = (report: StatsReport): boolean =>
  report.previous !== null &&
  report.humanDataStart !== null &&
  report.humanDataStart <= report.period.from - (report.period.to - report.period.from)

/**
 * Изменение против прошлого: null - сказать нечего (сравнения нет или оба нуля). Доля меньше
 * половины процента - «на месте»: «+0%» со стрелкой вверх врёт.
 */
export const deltaOf = (current: number, previous: number | null): Delta | null => {
  if (previous === null || (current === 0 && previous === 0)) return null
  if (previous === 0) return { direction: 'up', percent: null }

  const percent = ((current - previous) / previous) * 100

  if (Math.abs(percent) < 0.5) return { direction: 'flat', percent: 0 }

  return { direction: percent > 0 ? 'up' : 'down', percent }
}
