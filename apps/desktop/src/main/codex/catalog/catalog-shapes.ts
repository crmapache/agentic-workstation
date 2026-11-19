import type { UsageWindow, AccountUsage } from '@shared/account-usage'
import type { ModelInfo, EffortLevel, HistoryEntry } from '@shared/conversation'
import { CODEX_EFFORT_LEVELS } from '@shared/conversation'

import type { CodexItem } from '../feed/codex-tools'

/**
 * Ответы каталога `codex app-server` (model/list, account/read, account/rateLimits/read,
 * thread/list) в общие формы панели (ADR 0083). Ответ разбирается поле за полем: чужая или
 * будущая форма даёт пустое, а не исключение посреди панели.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const effortOf = (value: unknown): EffortLevel | undefined =>
  CODEX_EFFORT_LEVELS.find((level) => level === value)

/**
 * Есть ли у модели быстрый уровень: `priority` в `serviceTiers` (у старых Codex - `fast` в
 * `additionalSpeedTiers`). Уровни названы, а быстрого нет - нет; не названы вовсе -
 * неизвестно: молчание каталога - не «нет».
 */
const fastOf = (model: Record<string, unknown>): boolean | undefined => {
  const tiers = records(model['serviceTiers']).map((tier) => text(tier, 'id'))
  const speeds = Array.isArray(model['additionalSpeedTiers']) ? model['additionalSpeedTiers'] : []

  if (tiers.includes('priority') || speeds.includes('fast')) return true

  return tiers.length > 0 ? false : undefined
}

/** Модели Codex для меню: свои уровни усилия у каждой, скрытые - не в меню. */
export const modelsFromList = (result: unknown): ModelInfo[] =>
  records(isRecord(result) ? result['data'] : null)
    .filter((model) => model['hidden'] !== true)
    .map((model) => {
      const value = text(model, 'model') || text(model, 'id')
      const options = model['supportedReasoningEfforts']
      const known = records(options)
        .map((option) => effortOf(option['reasoningEffort']))
        .filter((level) => level !== undefined)
      // Явный пустой список - уровней нет; поля нет или уровни незнакомы - неизвестно:
      // окно возьмёт уровни провайдера, а не оставит меню Effort пустым.
      const efforts =
        Array.isArray(options) && (options.length === 0 || known.length > 0) ? known : undefined

      return {
        value,
        displayName: text(model, 'displayName') || value,
        description: text(model, 'description'),
        efforts,
        defaultEffort: effortOf(model['defaultReasoningEffort']),
        isDefault: model['isDefault'] === true,
        fast: fastOf(model),
      }
    })
    .filter((model) => model.value !== '')

/** Кто вошёл в Codex: вид входа, почта и тариф; не вошёл - null. */
export type CodexAccount = { kind: 'chatgpt' | 'apiKey' | 'other'; email: string; plan: string }

/**
 * Кто вошёл (`account/read`). null - не вошёл; undefined - неизвестно (каталог не ответил):
 * сбой связи - не повод для экрана входа. Codex без входа OpenAI (свой ключ, другой
 * поставщик моделей, requiresOpenaiAuth false) - вошёл, хоть аккаунта и нет.
 */
export const accountFromRead = (result: unknown): CodexAccount | null | undefined => {
  if (!isRecord(result)) return undefined

  const account = isRecord(result['account']) ? result['account'] : null

  if (!account) {
    return result['requiresOpenaiAuth'] === false ? { kind: 'other', email: '', plan: '' } : null
  }

  const type = text(account, 'type')

  return {
    kind: type === 'chatgpt' || type === 'apiKey' ? type : 'other',
    email: text(account, 'email'),
    plan: text(account, 'planType'),
  }
}

/** Окно лимита - словами панели: 5 часов, неделя или как назвал Codex. */
/** Окно - общими именами панели (UsageWindow.group): пять часов - session, неделя - weekly. */
const groupOf = (minutes: number | null, fallback: string): string => {
  if (minutes === 300) return 'session'
  if (minutes === 10_080) return 'weekly'

  return fallback
}

const windowOf = (value: unknown, fallback: string, model: string): UsageWindow | null => {
  if (!isRecord(value) || typeof value['usedPercent'] !== 'number') return null

  const minutes =
    typeof value['windowDurationMins'] === 'number' ? value['windowDurationMins'] : null
  const resetsAt = typeof value['resetsAt'] === 'number' ? value['resetsAt'] * 1000 : null
  const percent = value['usedPercent']

  return {
    group: groupOf(minutes, fallback),
    model,
    percent,
    resetsAt,
    severity: percent >= 100 ? 'error' : percent >= 80 ? 'warning' : 'normal',
  }
}

/**
 * Расход аккаунта Codex: окна лимитов всех корзин (`rateLimitsByLimitId`, главная - codex),
 * а без них - старая единственная корзина `rateLimits`.
 */
export const usageFromLimits = (result: unknown, now: number): AccountUsage => {
  const body = isRecord(result) ? result : {}
  const byId = isRecord(body['rateLimitsByLimitId']) ? body['rateLimitsByLimitId'] : null
  const buckets = byId
    ? Object.entries(byId).filter((entry): entry is [string, Record<string, unknown>] =>
        isRecord(entry[1]),
      )
    : isRecord(body['rateLimits'])
      ? [['codex', body['rateLimits']] as [string, Record<string, unknown>]]
      : []
  const windows = buckets.flatMap(([id, bucket]) => {
    const model = id === 'codex' ? '' : text(bucket, 'limitName') || id

    return [
      windowOf(bucket['primary'], 'primary', model),
      windowOf(bucket['secondary'], 'secondary', model),
    ].filter((window) => window !== null)
  })

  return { windows, extra: null, fetchedAt: now }
}

/** Прошлые разговоры проекта из thread/list: имя, иначе первое сообщение; субагенты - мимо. */
export const historyFromList = (result: unknown, open: ReadonlySet<string>): HistoryEntry[] =>
  records(isRecord(result) ? result['data'] : null)
    .filter((thread) => !thread['parentThreadId'] && thread['ephemeral'] !== true)
    .map((thread) => {
      const sessionId = text(thread, 'id')
      const updated = typeof thread['updatedAt'] === 'number' ? thread['updatedAt'] : 0

      return {
        sessionId,
        title: text(thread, 'name') || text(thread, 'preview'),
        updatedAt: updated * 1000,
        isOpen: open.has(sessionId),
      }
    })
    .filter((entry) => entry.sessionId !== '')

/**
 * Модель и усилие по умолчанию из настроек Codex для папки проекта (`config/read` с cwd):
 * то, что человек задал в config.toml, а не только модель каталога.
 */
export const defaultsFromConfig = (
  result: unknown,
): { model: string | null; effort: EffortLevel | null } => {
  const config = isRecord(result) && isRecord(result['config']) ? result['config'] : {}

  return {
    model: text(config, 'model') || null,
    effort: effortOf(config['model_reasoning_effort']) ?? null,
  }
}

/** Ход из журнала Codex (`thread/turns/list`, itemsView full); время - в мс, 0 - неизвестно. */
export type CodexTurn = {
  id: string
  items: CodexItem[]
  status: string
  error: string
  startedAt: number
  completedAt: number
}

/** Страница ходов, свежие первыми; nextCursor - что раньше, null - раньше ничего. */
export type CodexTurnsPage = { turns: CodexTurn[]; nextCursor: string | null }

const secondsToMs = (value: unknown): number => (typeof value === 'number' ? value * 1000 : 0)

export const turnsFromList = (result: unknown): CodexTurnsPage => {
  const body = isRecord(result) ? result : {}

  return {
    turns: records(body['data']).map((turn) => ({
      id: text(turn, 'id'),
      items: records(turn['items']).filter(
        (item): item is CodexItem =>
          typeof item['type'] === 'string' && typeof item['id'] === 'string',
      ),
      status: text(turn, 'status'),
      error: isRecord(turn['error']) ? text(turn['error'], 'message') : '',
      startedAt: secondsToMs(turn['startedAt']),
      completedAt: secondsToMs(turn['completedAt']),
    })),
    nextCursor: text(body, 'nextCursor') || null,
  }
}
