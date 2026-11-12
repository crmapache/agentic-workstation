import { MINUTE_MS, SECOND_MS } from '@shared/time-units'

/**
 * Цифры сценариев для людей - одни на весь вид: карточка очереди, окно прогона и история
 * показывают одну и ту же цену и длительность одинаково.
 */

/**
 * Длительность для людей, как в панели Claude Code: «0.4s», «12s», «3m 05s», «1h 02m 05s».
 * Свои часы, а не панели: фича соседнюю не видит, а цифры у них должны читаться одинаково.
 */
export const formatDuration = (ms: number): string => {
  const value = Math.max(0, ms)

  if (value < 10 * SECOND_MS) return `${(value / SECOND_MS).toFixed(1)}s`
  // 59.6 s - уже минута: «60s» читается как недосчитанная минута.
  if (Math.round(value / SECOND_MS) < MINUTE_MS / SECOND_MS)
    return `${Math.round(value / SECOND_MS)}s`

  const pad = (part: number) => String(part).padStart(2, '0')
  const total = Math.round(value / SECOND_MS)
  const minutes = Math.floor(total / 60)

  if (minutes < 60) return `${minutes}m ${pad(total % 60)}s`

  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m ${pad(total % 60)}s`
}

/** Число токенов коротко: «950», «12.4k», «1.2M». */
export const formatTokens = (tokens: number): string => {
  if (tokens < 1000) return String(tokens)
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(tokens < 10_000 ? 1 : 0)}k`

  return `${(tokens / 1_000_000).toFixed(1)}M`
}

/** Деньги: доллары с центами, копеечное - с третьим знаком, иначе $0.00 читалось бы «даром». */
export const formatCost = (usd: number): string =>
  usd >= 1 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(usd >= 0.1 ? 2 : 3)}`
