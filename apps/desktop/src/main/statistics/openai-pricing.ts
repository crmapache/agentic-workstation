import type { AnswerTokens } from './pricing'

/**
 * Цены моделей OpenAI на API (Codex), долларов за миллион токенов, уровень Standard. Сняты
 * 2026-11-18 со страницы https://developers.openai.com/api/docs/pricing.
 *
 * Карточек у модели до четырёх: короткий запрос и длинный (весь вход больше 272 тысяч
 * токенов - вся просьба по длинной карточке), каждая - Standard и Fast (бывший Priority: у
 * Codex это `service_tier = priority`, быстрый режим панели). У GPT-6 и GPT-5.6 Fast - ровно
 * вдвое против Standard на обеих длинах, запись кеша на 30 минут - 1.25 цены входа. Журнал
 * Codex не пишет, на сколько записан кеш (30 минут или 12 часов), - считается по 30 минутам,
 * короткой и дешёвой. У старых моделей цены записи кеша нет: тогда её токены идут по цене
 * входа - так OpenAI и брал за вход, не прочитанный из кеша.
 *
 * Модели, которой нет в таблице (gpt-5-codex, gpt-5.1-codex, служебные модели Codex), и
 * карточки, которой нет на странице (Fast длинного запроса у GPT-5.5 и GPT-5.4), стоимости
 * не получают: ноль честнее чужой цены - в отличие от Claude, где неизвестная модель почти
 * наверняка новая версия Opus, здесь угадать карточку не из чего. Уровни Flex и Ultrafast
 * разбор журнала считает по Standard: панель IDE их не просит, а цены Ultrafast есть не у
 * всех моделей и меняются по датам.
 *
 * Поменялись цены - поправить таблицу и поднять PRICES_VERSION в pricing.ts.
 */

/** Карточка цены: вход, чтение кеша, выход и запись кеша (null - по цене входа). */
type Card = { input: number; cacheRead: number; output: number; cacheWrite: number | null }

type ModelPrices = {
  short: Card
  /** Нет - у модели одна карточка на любую длину запроса. */
  long?: Card
  /** Во сколько раз Fast дороже Standard; нет - Fast у модели не опубликован. */
  fast?: number
  /** То же для длинного запроса, если он отличается от короткого. */
  fastLong?: number
}

/** Порог длинного запроса: весь вход (с кешем) больше этого - вся просьба по длинной карточке. */
const LONG_PROMPT_TOKENS = 272_000

/** Карточка с записью кеша на 30 минут по 1.25 цены входа, как у GPT-6 и GPT-5.6. */
const card = (input: number, cacheRead: number, output: number): Card => ({
  input,
  cacheRead,
  output,
  cacheWrite: input * 1.25,
})

/** Карточка без цены записи кеша (GPT-5.5 и старше). */
const plain = (input: number, cacheRead: number, output: number): Card => ({
  input,
  cacheRead,
  output,
  cacheWrite: null,
})

/** GPT-6 и GPT-5.6: короткая и длинная карточки, Fast вдвое на обеих. */
const sixth = (short: Card, long: Card): ModelPrices => ({ short, long, fast: 2, fastLong: 2 })

/** Ключ - имя модели, как его пишет Codex в turn_context.model. */
const TABLE: Readonly<Record<string, ModelPrices>> = {
  'gpt-6.2-astra': sixth(card(8, 0.4, 40), card(16, 0.8, 60)),
  'gpt-6.2-sol': sixth(card(2, 0.1, 10), card(4, 0.2, 15)),
  'gpt-6-astra': sixth(card(10, 1, 50), card(20, 2, 75)),
  'gpt-6.1-sol': sixth(card(2, 0.1, 10), card(4, 0.2, 15)),
  'gpt-6.1-terra': sixth(card(1, 0.05, 5), card(2, 0.1, 7.5)),
  'gpt-6-luna': sixth(card(0.1, 0.01, 0.5), card(0.2, 0.02, 0.75)),
  'gpt-6-sol': sixth(card(2, 0.2, 10), card(4, 0.4, 15)),
  'gpt-5.6-sol': sixth(card(4, 0.4, 20), card(8, 0.8, 30)),
  'gpt-5.6-terra': sixth(card(2, 0.2, 12), card(4, 0.4, 18)),
  'gpt-5.6-luna': sixth(card(0.2, 0.02, 1.2), card(0.4, 0.04, 1.8)),
  'gpt-5.5': { short: plain(5, 0.5, 30), long: plain(10, 1, 45), fast: 2.5 },
  'gpt-5.4': { short: plain(2.5, 0.25, 15), long: plain(5, 0.5, 22.5), fast: 2 },
  'gpt-5.4-mini': { short: plain(0.75, 0.075, 4.5) },
  'gpt-5.4-nano': { short: plain(0.2, 0.02, 1.25) },
  'gpt-5.3-codex': { short: plain(1.75, 0.175, 14), fast: 2 },
  'gpt-5.2': { short: plain(1.75, 0.175, 14) },
  'gpt-5.1': { short: plain(1.25, 0.125, 10) },
  'gpt-5': { short: plain(1.25, 0.125, 10) },
  'gpt-5-mini': { short: plain(0.25, 0.025, 2) },
  'gpt-5-nano': { short: plain(0.05, 0.005, 0.4) },
}

/** Дата сборки в конце имени («gpt-5-2025-08-07») к цене не относится. */
const DATED = /-\d{4}-\d{2}-\d{2}$/

/** Карточка и множитель Fast для этого ответа; null - цены нет. */
const rateOf = (model: string, promptTokens: number, fast: boolean) => {
  const prices = TABLE[model.toLowerCase().replace(DATED, '')]

  if (!prices) return null

  const long = prices.long !== undefined && promptTokens > LONG_PROMPT_TOKENS
  const rate = long ? prices.long : prices.short
  const factor = fast ? (long ? (prices.fastLong ?? null) : (prices.fast ?? null)) : 1

  return rate && factor !== null ? { rate, factor } : null
}

/**
 * Стоимость ответа модели OpenAI в долларах; 0 - цена модели или её уровня не известна.
 * Токены - уже в смысле статистики: input - только свежий вход, кеш отдельно.
 */
export const openAiCostOf = (model: string, tokens: AnswerTokens): number => {
  const prompt = tokens.input + tokens.cacheRead + tokens.cacheWrite
  const found = rateOf(model, prompt, tokens.fast)

  if (!found) return 0

  const { rate, factor } = found
  const dollars =
    tokens.input * rate.input +
    tokens.cacheRead * rate.cacheRead +
    tokens.cacheWrite * (rate.cacheWrite ?? rate.input) +
    tokens.output * rate.output

  return (dollars / 1_000_000) * factor
}
