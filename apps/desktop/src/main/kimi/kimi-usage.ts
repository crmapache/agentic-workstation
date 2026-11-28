import type { UsageWindow, AccountUsage } from '@shared/account-usage'

import type { KimiAccess } from './kimi-access'
import { KIMI_CLIENT_HEADERS } from './kimi-access'

/** Сколько ждать ответа сервера о лимитах: столько же даёт сам Kimi. */
const USAGE_TIMEOUT_MS = 8_000

/**
 * Окна подписки Kimi словами панели (UsageWindow.group): пять часов - session, неделя - weekly,
 * месяц - monthly. Месяц - общий по тарифу (`limit_month_total`), как его показывает сам Kimi;
 * доля кода внутри него - не отдельный предел.
 */
const WINDOWS: readonly (readonly [string, string])[] = [
  ['limit_5h', 'session'],
  ['limit_7d', 'weekly'],
  ['limit_month_total', 'monthly'],
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Число из ответа Kimi: бывает и строкой. */
const numberOf = (value: unknown): number | null => {
  const number = typeof value === 'string' ? Number(value) : value

  return typeof number === 'number' && Number.isFinite(number) ? number : null
}

const windowOf = (value: unknown, group: string): UsageWindow | null => {
  if (!isRecord(value)) return null

  const ratio = numberOf(value['used_ratio'])

  if (ratio === null) return null

  const reset = typeof value['reset_time'] === 'string' ? Date.parse(value['reset_time']) : NaN

  return {
    group,
    model: '',
    percent: ratio * 100,
    resetsAt: Number.isNaN(reset) ? null : reset,
    // Уровень Kimi не называет: ступень окно считает само по проценту и темпу.
    severity: 'normal',
  }
}

/**
 * Доплата сверх подписки: у Kimi это кошелёк пакетов (`boosterWallet`, тип BOOSTER) - пока в нём
 * что-то есть, работа идёт и за пределом окон. Доли месячного потолка Kimi не даёт - без неё.
 */
const extraOf = (wallet: unknown): AccountUsage['extra'] => {
  const balance = isRecord(wallet) && isRecord(wallet['balance']) ? wallet['balance'] : null

  if (!balance || balance['type'] !== 'BOOSTER') return null

  return (numberOf(balance['amountLeft']) ?? 0) > 0 ? { percent: null } : null
}

/**
 * Расход подписки Kimi Code из ответа `GET <сервер>/usages` (тот же, что показывает `/usage` в
 * окне Kimi): `usages.limit_5h`, `limit_7d`, `limit_month_total` - доля и сброс. Окна, которых у
 * тарифа нет, сервер не присылает.
 */
export const usageFromKimi = (body: unknown, now: number): AccountUsage => {
  const usages = isRecord(body) && isRecord(body['usages']) ? body['usages'] : {}
  const windows = WINDOWS.flatMap(([key, group]) => {
    const window = windowOf(usages[key], group)

    return window ? [window] : []
  })

  return { windows, extra: extraOf(isRecord(body) ? body['boosterWallet'] : null), fetchedAt: now }
}

/**
 * Лимиты подписки Kimi с его сервера токеном его входа (только чтение - ничего не меняет).
 * Сервер не ответил или отказал - null: окно держит прежние цифры с их давностью.
 */
export const fetchKimiUsage = async (access: KimiAccess): Promise<AccountUsage | null> => {
  try {
    const response = await fetch(`${access.baseUrl}/usages`, {
      headers: { ...KIMI_CLIENT_HEADERS, Authorization: `Bearer ${access.token}` },
      signal: AbortSignal.timeout(USAGE_TIMEOUT_MS),
    })

    if (!response.ok) {
      console.warn(`[kimi] лимиты: сервер ответил ${response.status}`)

      return null
    }

    return usageFromKimi(await response.json(), Date.now())
  } catch (error) {
    console.warn('[kimi] лимиты не получены:', error)

    return null
  }
}
