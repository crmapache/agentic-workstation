import type { AnswerTokens } from './pricing'

/**
 * Цены моделей, которые гоняет Antigravity (`agy`), на API Google, долларов за миллион токенов,
 * уровень Standard. Gemini сняты 2026-11-19 со страницы
 * https://ai.google.dev/gemini-api/docs/pricing, GPT-OSS (своего API у OpenAI для неё нет, её
 * продаёт Google) - в тот же день со страницы https://cloud.google.com/model-garden/partner-models/pricing
 * (раздел OpenAI's models). Claude внутри Antigravity считается по таблице Claude (pricing.ts).
 *
 * У части моделей Google объявил цену со сроком: Gemini 3.8 и 3.6 Flash стоят вдвое меньше по
 * 31 декабря 2026 включительно, Gemini 4 Carbon и Argon - по 30 ноября 2026. Поэтому у модели
 * ступени по датам, и ответ считается по цене дня, когда он был: смена цены не переоценивает
 * старые ответы, а таблицу не надо править в день смены. Граница - полночь по тихоокеанскому
 * времени, по нему Google ведёт счёт.
 *
 * У Gemini 3.1 Pro две карточки: весь вход (с кешем) больше 200 тысяч токенов - вся просьба по
 * длинной. Чтение кеша - цена «Context caching»: `agy` пользуется неявным кешем, хранение
 * явного кеша (почасовая цена) к нему не относится. Записи кеша `agy` не пишет; если она
 * появится, её токены идут по цене входа - так Google и берёт за вход, ещё не бывший в кеше. У
 * GPT-OSS 120B скидки на кеш нет: прочитанное из кеша - по цене входа.
 *
 * Модели, которой нет на этих страницах (например снятой Gemini 3 Pro), стоимости не получают:
 * ноль честнее чужой цены. Уровень Priority разбор не различает: журнал `agy` его не пишет.
 *
 * Поменялись цены - поправить таблицу и поднять PRICES_VERSION в pricing.ts.
 */

/** Карточка цены: вход, чтение кеша, выход. */
type Card = { input: number; cacheRead: number; output: number }

/** Ступень цены: действует до until (мс, не включая); у последней ступени until нет. */
type Step = {
  until?: number
  short: Card
  /** Нет - одна карточка на любую длину запроса. */
  long?: Card
}

/** Порог длинного запроса: весь вход (с кешем) больше этого - вся просьба по длинной карточке. */
const LONG_PROMPT_TOKENS = 200_000

const card = (input: number, cacheRead: number, output: number): Card => ({
  input,
  cacheRead,
  output,
})

/** Полночь по тихоокеанскому времени: в декабре и январе это UTC-8. */
const pacificMidnight = (year: number, month: number, day: number): number =>
  Date.UTC(year, month - 1, day, 8)

/** Акции Google кончаются в эти дни (первый день полной цены). */
const DECEMBER_2026 = pacificMidnight(2026, 12, 1)
const JANUARY_2027 = pacificMidnight(2027, 1, 1)

const flat = (price: Card): readonly Step[] => [{ short: price }]

/** До даты - цена акции, с неё - полная. */
const promo = (end: number, before: Card, after: Card): readonly Step[] => [
  { until: end, short: before },
  { short: after },
]

/** Ключ - имя модели без хвостов, которые снимает keyOf. */
const TABLE: Readonly<Record<string, readonly Step[]>> = {
  'gemini-4-carbon': promo(DECEMBER_2026, card(2, 0.1, 10), card(4, 0.2, 20)),
  'gemini-4-argon': promo(DECEMBER_2026, card(2, 0.1, 10), card(4, 0.2, 20)),
  'gemini-4-neon': flat(card(3, 0.15, 15)),
  'gemini-4-hydrogen': flat(card(1.5, 0.075, 7.5)),
  'gemini-3.8-flash': promo(JANUARY_2027, card(0.75, 0.075, 3.75), card(1.5, 0.15, 7.5)),
  'gemini-3.6-flash': promo(JANUARY_2027, card(0.75, 0.075, 3.75), card(1.5, 0.15, 7.5)),
  'gemini-3.5-flash-lite': flat(card(0.3, 0.03, 2.5)),
  'gemini-3.1-pro': [{ short: card(2, 0.2, 12), long: card(4, 0.4, 18) }],
  'gemini-3.1-flash-lite': flat(card(0.25, 0.025, 1.5)),
  'gemini-3-flash': flat(card(0.5, 0.05, 3)),
  'gpt-oss-120b': flat(card(0.09, 0.09, 0.36)),
  'gpt-oss-20b': flat(card(0.07, 0.007, 0.25)),
}

/**
 * Хвосты имени, которые к цене не относятся: уровень размышления, который `agy` дописывает к
 * модели («gemini-3.8-flash-low», «gpt-oss-120b-medium»), и пометки версии API («-preview»,
 * «-customtools» у Gemini 3.1 Pro). Порядок важен: уровень стоит в самом конце.
 */
const SUFFIXES = [/-(minimal|low|medium|high)$/, /-customtools$/, /-preview$/]

const keyOf = (model: string): string =>
  SUFFIXES.reduce((name, suffix) => name.replace(suffix, ''), model.toLowerCase())

/** Карточка для этого ответа; null - цены нет. */
const rateOf = (model: string, tokens: AnswerTokens): Card | null => {
  const step = TABLE[keyOf(model)]?.find((row) => row.until === undefined || tokens.ts < row.until)

  if (!step) return null

  const prompt = tokens.input + tokens.cacheRead + tokens.cacheWrite

  return step.long && prompt > LONG_PROMPT_TOKENS ? step.long : step.short
}

/**
 * Стоимость ответа модели Google (Gemini, GPT-OSS) в долларах; 0 - цена модели не известна.
 * Токены - уже в смысле статистики: input - только свежий вход, кеш отдельно.
 */
export const googleCostOf = (model: string, tokens: AnswerTokens): number => {
  const rate = rateOf(model, tokens)

  if (!rate) return 0

  const dollars =
    tokens.input * rate.input +
    tokens.cacheRead * rate.cacheRead +
    tokens.cacheWrite * rate.input +
    tokens.output * rate.output

  return dollars / 1_000_000
}
