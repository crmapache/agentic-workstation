import type { ProviderId } from '@shared/providers'
import { isProviderId } from '@shared/providers'

import { googleCostOf } from './google-pricing'
import { moonshotCostOf } from './moonshot-pricing'
import { openAiCostOf } from './openai-pricing'

/**
 * Цены моделей Claude на API, долларов за миллион токенов. Стоимость в статистике -
 * «на ценах API»: сколько стоило бы то же самое по счёту API, а не сколько списала подписка.
 * Модели Codex - по своей таблице (openai-pricing.ts), Antigravity - по ценам Google
 * (google-pricing.ts), Kimi - по ценам Moonshot (moonshot-pricing.ts), открытые модели - по
 * стоимости, которую записал сам OpenCode (answerCostOf).
 *
 * Цены сняты 2026-11-10 из скилла claude-api (его таблица моделей от 2026-10-06); у старых
 * моделей, которых в таблице скилла уже нет (Opus 4/4.1, Haiku 3/3.5), - последние
 * публиковавшиеся. Запись кеша на 5 минут - 1.25 цены входа, на час - 2 цены; чтение кеша у
 * каждой модели своё (Fable 5.1 - 0.025, Opus 5.5 - 0.05, остальные - 0.1). Быстрый режим
 * (usage.speed = 'fast') - вдвое дороже обычного.
 *
 * Поменялись цены (здесь или в таблице другого провайдера) - поправить таблицу и поднять
 * PRICES_VERSION: при запуске стоимость ответов провайдеров из PRICED_PROVIDERS в базе
 * пересчитается (stats-engine.ts).
 */
export const PRICES_VERSION = '2026-11-19'

/** Цена за миллион токенов. */
export type Price = {
  input: number
  output: number
  cacheRead: number
  cacheWrite5m: number
  cacheWrite1h: number
}

const price = (input: number, output: number, cacheRead: number): Price => ({
  input,
  output,
  cacheRead,
  cacheWrite5m: input * 1.25,
  cacheWrite1h: input * 2,
})

/** Порядок важен: первая подошедшая строка. Имена - как их пишет CLI в message.model. */
const TABLE: readonly { match: RegExp; price: Price }[] = [
  { match: /(fable|mythos)-5-1/, price: price(10, 50, 0.25) },
  { match: /fable|mythos/, price: price(10, 50, 1) },
  { match: /opus-5-5/, price: price(4, 20, 0.2) },
  { match: /opus-(5|4-[5-9])/, price: price(5, 25, 0.5) },
  { match: /opus/, price: price(15, 75, 1.5) },
  { match: /sonnet-5/, price: price(2, 10, 0.2) },
  { match: /sonnet/, price: price(3, 15, 0.3) },
  { match: /haiku-5/, price: price(0.1, 0.5, 0.01) },
  { match: /haiku-4/, price: price(1, 5, 0.1) },
  { match: /3-5-haiku|haiku-3-5/, price: price(0.8, 4, 0.08) },
  { match: /haiku/, price: price(0.25, 1.25, 0.03) },
]

/**
 * Haiku 5.5 с длинным запросом (весь вход больше 100 тысяч токенов) - по второй карточке,
 * впятеро дороже.
 */
const HAIKU_LONG = { match: /haiku-5/, price: price(0.5, 2.5, 0.05), above: 100_000 }

/**
 * Модель, которой нет в таблице (вышла после неё), считается по текущему Opus - модели по
 * умолчанию: ошибка в цене новой модели меньше, чем ноль вместо цены.
 */
const DEFAULT_PRICE = price(4, 20, 0.2)

/** Расход ответа для цены. */
export type AnswerTokens = {
  input: number
  output: number
  cacheRead: number
  /** Вся запись кеша, включая часовую. */
  cacheWrite: number
  cacheWrite1h: number
  fast: boolean
  /** Когда дан ответ (мс): у части цен Google есть срок, ответ считается по цене своего дня. */
  ts: number
}

export const priceOf = (model: string, promptTokens = 0): Price => {
  const lower = model.toLowerCase()

  if (HAIKU_LONG.match.test(lower) && promptTokens > HAIKU_LONG.above) return HAIKU_LONG.price

  return TABLE.find((row) => row.match.test(lower))?.price ?? DEFAULT_PRICE
}

/** Стоимость одного ответа в долларах. */
export const costOf = (model: string, tokens: AnswerTokens): number => {
  const prompt = tokens.input + tokens.cacheRead + tokens.cacheWrite
  const rate = priceOf(model, prompt)
  const hour = Math.min(tokens.cacheWrite1h, tokens.cacheWrite)
  const dollars =
    tokens.input * rate.input +
    tokens.output * rate.output +
    tokens.cacheRead * rate.cacheRead +
    (tokens.cacheWrite - hour) * rate.cacheWrite5m +
    hour * rate.cacheWrite1h

  return (dollars / 1_000_000) * (tokens.fast ? 2 : 1)
}

/** Провайдеры, чью стоимость считает таблица IDE: её и пересчитывает смена цен. */
export const PRICED_PROVIDERS: readonly ProviderId[] = ['claude', 'codex', 'antigravity', 'kimi']

/**
 * Antigravity гоняет и чужие модели: Claude - по таблице выше, остальное (Gemini, GPT-OSS) - по
 * ценам Google. Шаг `agy` до 1.5.12 модели не пишет (засчитан только по токенам) - у него
 * пустое имя, и стоимости он не получает: какая модель отвечала, угадать не из чего.
 */
const antigravityCostOf = (model: string, tokens: AnswerTokens): number =>
  model.toLowerCase().startsWith('claude') ? costOf(model, tokens) : googleCostOf(model, tokens)

/** Как провайдер считает стоимость ответа; stored - стоимость, которую записал он сам. */
type ProviderCost = (model: string, tokens: AnswerTokens, stored: number) => number

const COST_OF: Record<ProviderId, ProviderCost> = {
  claude: costOf,
  codex: openAiCostOf,
  antigravity: antigravityCostOf,
  kimi: moonshotCostOf,
  // Открытые модели - сколько записал OpenCode; локальные модели - ноль.
  opencode: (_model, _tokens, stored) => (Number.isFinite(stored) && stored > 0 ? stored : 0),
}

/**
 * Стоимость ответа у провайдера: Claude - по таблице выше, Codex - по таблице OpenAI,
 * Antigravity - по модели (antigravityCostOf), Kimi - по таблице Moonshot, открытые модели -
 * сколько записал OpenCode. Провайдер, которого IDE не знает, стоимости не получает.
 */
export const answerCostOf = (
  provider: string,
  model: string,
  tokens: AnswerTokens,
  stored = 0,
): number => (isProviderId(provider) ? COST_OF[provider](model, tokens, stored) : 0)
