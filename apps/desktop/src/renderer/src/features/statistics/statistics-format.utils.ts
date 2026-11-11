import { MINUTE_MS } from './statistics.constants'
import type { Delta } from './statistics.types'

/**
 * Числа статистики для людей - одни на весь вид: плитка, график, подсказка и таблица
 * показывают одно и то же число одинаково. Единицы (k, M, h, m, $) - знаки, а не слова
 * интерфейса: не переводятся, как в панели Claude Code.
 */

const UNITS: readonly (readonly [number, string])[] = [
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'k'],
]

/** Сокращённое число: до сотни - с десятыми, дальше - целыми. «950», «12.4k», «124k», «3.1M». */
const compact = (value: number, divisor: number, suffix: string): string => {
  const scaled = value / divisor
  const text = scaled < 100 ? scaled.toFixed(1).replace(/\.0$/, '') : String(Math.round(scaled))

  return `${text}${suffix}`
}

/**
 * Счёт (строки, токены, вызовы) коротко. Округление не перескакивает единицу: 999 950 - это
 * «1M», а не «1000k».
 */
export const formatCount = (value: number): string => {
  const count = Math.round(Math.max(0, value))

  for (const [index, [divisor, suffix]] of UNITS.entries()) {
    const bigger = UNITS[index - 1]

    if (count < divisor) continue
    if (bigger && Math.round(count / divisor) >= 1000) return compact(count, ...bigger)

    return compact(count, divisor, suffix)
  }

  return String(count)
}

/** Длительность часами и минутами: «45m», «3h 20m», «312h». Меньше минуты, но не ноль - «<1m». */
export const formatDuration = (ms: number): string => {
  const minutes = Math.round(Math.max(0, ms) / MINUTE_MS)

  if (minutes === 0) return ms > 0 ? '<1m' : '0m'

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  if (hours === 0) return `${rest}m`
  // Сотни часов - уже не про минуты: «312h 07m» только шумит.
  if (rest === 0 || hours >= 100) return `${hours}h`

  return `${hours}h ${rest}m`
}

/**
 * Деньги «на ценах API»: центы до сотни долларов, целые доллары до десяти тысяч, дальше
 * коротко. Копеечное - «<$0.01», чтобы $0.00 не читалось как «даром».
 */
export const formatCost = (usd: number): string => {
  if (!(usd > 0)) return '$0'
  if (usd < 0.01) return '<$0.01'
  if (usd < 100) return `$${usd.toFixed(2)}`
  if (usd < 10_000) return `$${Math.round(usd).toLocaleString('en-US')}`

  return `$${formatCount(usd)}`
}

/** Доля процентами: крохотная, но не ноль - «<1%», почти вся - «>99%». */
export const formatPercent = (share: number): string => {
  if (!(share > 0)) return '0%'
  if (share < 0.01) return '<1%'
  if (share < 1 && share > 0.99) return '>99%'

  return `${Math.round(share * 100)}%`
}

/** Объём файлов: «512 KB», «340 MB», «7.7 GB». */
export const formatBytes = (bytes: number): string => {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`

  return `${Math.max(0, Math.round(bytes / 1e3))} KB`
}

/** Изменение процентом со знаком: «+12%», «-8%». Для «на месте» и «новое» слова - в i18n. */
export const formatDeltaPercent = (delta: Delta): string => {
  const percent = Math.round(delta.percent ?? 0)

  return percent > 0 ? `+${percent}%` : `${percent}%`
}

/** Доля части в целом; целое ноль - ноль, а не NaN. */
export const shareOf = (part: number, whole: number): number => (whole > 0 ? part / whole : 0)
