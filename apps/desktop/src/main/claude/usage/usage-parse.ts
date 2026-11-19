import type { UsageWindow, AccountUsage } from '@shared/account-usage'

import { isRecord, recordField, stringField, recordsField } from '../cli/cli-messages'

/** Ответ CLI о расходе: окна и доплата; fromServer - сервер, а не подставленные цифры. */
export type ParsedUsage = Omit<AccountUsage, 'fetchedAt'> & { fromServer: boolean }

const time = (value: string): number | null => {
  const parsed = Date.parse(value)

  return Number.isNaN(parsed) ? null : parsed
}

const numberOf = (record: Record<string, unknown>, key: string): number | null => {
  const value = record[key]

  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Окна из списка сервера: у каждого группа, процент, сброс и модель, если окно её. */
const fromLimits = (limits: Record<string, unknown>[]): UsageWindow[] =>
  limits
    .map((limit) => ({
      group: stringField(limit, 'group') || stringField(limit, 'kind'),
      model: stringField(recordField(recordField(limit, 'scope'), 'model'), 'display_name'),
      percent: numberOf(limit, 'percent') ?? -1,
      resetsAt: time(stringField(limit, 'resets_at')),
      severity: stringField(limit, 'severity'),
    }))
    .filter((window) => window.percent >= 0)

const window = (record: Record<string, unknown>, group: string, model = ''): UsageWindow[] => {
  const percent = numberOf(record, 'utilization')

  return percent === null
    ? []
    : [{ group, model, percent, resetsAt: time(stringField(record, 'resets_at')), severity: '' }]
}

/**
 * Окна из старых полей - так CLI отвечает подставленными цифрами (заголовки ответов
 * модели или свой кэш): пять часов, неделя и недели моделей.
 */
const fromFields = (limits: Record<string, unknown>): UsageWindow[] => [
  ...window(recordField(limits, 'five_hour'), 'session'),
  ...window(recordField(limits, 'seven_day'), 'weekly'),
  ...recordsField(limits, 'model_scoped').flatMap((scoped) =>
    window(scoped, 'weekly', stringField(scoped, 'display_name')),
  ),
]

/**
 * Разбор ответа CLI на `get_usage` (замер на 2.1.293). Список `limits` есть только у
 * ответа сервера; подставленный ответ (сервер отбил вопрос, 429) несёт старые поля -
 * по ним и видно, откуда цифры. null - лимитов в ответе нет вовсе: CLI не успел узнать
 * подписку или ему не на что опереться.
 */
export const parseUsage = (reply: unknown): ParsedUsage | null => {
  const limits = isRecord(reply) ? recordField(reply, 'rate_limits') : {}
  const list = recordsField(limits, 'limits')
  const fromServer = Array.isArray(limits['limits'])
  const windows = fromServer ? fromLimits(list) : fromFields(limits)

  if (windows.length === 0) return null

  const extra = recordField(limits, 'extra_usage')

  return {
    windows,
    extra: extra['is_enabled'] === true ? { percent: numberOf(extra, 'utilization') } : null,
    fromServer,
  }
}
