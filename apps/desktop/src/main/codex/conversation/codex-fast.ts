import type { FastReport } from '@shared/panel-extras'

import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { codexOf } from './codex-conversation'

/**
 * Быстрый режим Codex (как в amazing-codex) - уровень обслуживания `priority` («Fast» в
 * каталоге): ответы быстрее, лимиты тратятся быстрее. Просьба панели трёхзначная и живёт с
 * разговором (`Conversation.fastMode`): нет - как в конфиге Codex (`service_tier`), true -
 * `priority`, false - `default`. Правду говорит сам Codex: уровень в ответе на открытие
 * потока и в `thread/settings/updated`. Отказа у Codex нет: уровень, которого у модели нет,
 * он молча выбрасывает.
 */

/** Быстрый уровень, который просит панель. */
export const FAST_TIER = 'priority'

/** Быстрые уровни: `priority` и старые имена; не `flex` - он медленнее и дешевле. */
const FAST_TIERS: ReadonlySet<string> = new Set([FAST_TIER, 'fast', 'ultrafast'])

export const isFastTier = (tier: string | null): boolean => tier !== null && FAST_TIERS.has(tier)

/**
 * Уровень, который едет с открытием потока и с каждым ходом: Codex держит его на следующие
 * ходы, но только в этом процессе. Просьбы нет - не едет ничего, и Codex берёт свой конфиг.
 */
export const tierOnWire = (fastMode: boolean | undefined): string | undefined =>
  fastMode === undefined ? undefined : fastMode ? FAST_TIER : 'default'

/** Что знает сессия, чтобы сказать о быстром режиме. */
export type FastFacts = {
  /** Просьба панели сейчас. */
  asked: boolean | undefined
  /** Просьба, которую нёс последний запрос с уровнем (открытие потока или ход). */
  sent: boolean | undefined
  /** Уровень, которым ответил Codex; null - не сказал или обычный. */
  tier: string | null
  /** Есть ли быстрый уровень у модели по каталогу; нет в каталоге - неизвестно. */
  modelFast: boolean | undefined
}

/**
 * Ответ о быстром режиме словами панели (`FastReport`). Работает - быстрый уровень, кто бы
 * его ни поставил, но не на модели, у которой каталог его не знает. Причины - только для
 * просьбы панели: `pending` - просьба новее последнего запроса, который её нёс (рано судить);
 * `model_not_allowed` - у модели нет быстрого уровня; `not_served` - Codex ответил другим.
 */
export const fastReportOf = (facts: FastFacts): FastReport => {
  if (isFastTier(facts.tier) && facts.modelFast !== false) return { state: 'on', reason: '' }
  if (facts.asked !== true) return { state: 'off', reason: '' }
  if (facts.sent !== true) return { state: 'off', reason: 'pending' }

  return { state: 'off', reason: facts.modelFast === false ? 'model_not_allowed' : 'not_served' }
}

/** Причины, о которых лента говорит строкой FAST: режим попросили, а он не включился. */
const NOTED_REASONS: ReadonlySet<string> = new Set(['model_not_allowed', 'not_served'])

/**
 * Ответ - разговору; отказ по новой причине - строкой FAST в ленте, один раз на причину с
 * момента просьбы (`CodexConversation.fastNoted`): меню закрывается, и без строки ходы молча
 * шли бы на обычной скорости.
 */
export const noteFastReport = (runtime: ConversationRuntime, report: FastReport): void => {
  const codex = codexOf(runtime)
  const shown = runtime.meta.fastReport

  if (report.state !== shown?.state || report.reason !== shown.reason) {
    runtime.update({ fastReport: report })
  }

  if (report.state === 'on') {
    codex.fastNoted = ''

    return
  }

  if (!NOTED_REASONS.has(report.reason) || report.reason === codex.fastNoted) return

  codex.fastNoted = report.reason
  codex.feed.builder.addNotice('fast', report.reason)
  codex.feed.schedule()
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Поле уровня для запроса (`serviceTier`); просьбы нет - пусто. */
export const tierField = (fastMode: boolean | undefined): { serviceTier?: string } => {
  const tier = tierOnWire(fastMode)

  return tier ? { serviceTier: tier } : {}
}

/**
 * Уровень из ответа Codex: ответ на открытие потока (`thread/start|resume|fork`) или
 * настройки потока (`thread/settings/updated` → `threadSettings`). Нет - null.
 */
export const tierOf = (body: unknown): string | null =>
  isRecord(body) && typeof body['serviceTier'] === 'string' ? body['serviceTier'] : null
