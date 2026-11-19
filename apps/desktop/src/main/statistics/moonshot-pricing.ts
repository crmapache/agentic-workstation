import type { AnswerTokens } from './pricing'

/**
 * Цены моделей Kimi на API Moonshot (Kimi API Platform), долларов за миллион токенов. Сняты
 * 2026-11-19 со страницы https://platform.kimi.ai/docs/pricing/chat (туда ведёт и
 * https://platform.moonshot.ai/docs/pricing/chat).
 *
 * Kimi Code (подписка) называет модели по-своему: в журнале `kimi-code/kimi-for-coding` (в
 * его каталоге - «K2.7 Coding»), `kimi-code/k3`, `kimi-code/k3-256k`. Ответ считается по модели
 * платформы, на которой стоит то же имя. `kimi-for-coding` - псевдоним, до K2.7 Code (июнь
 * 2026) за ним стояла K2.6: вход и выход у неё те же, чтение кеша чуть дешевле (0.16), так что
 * старые ответы считаются по K2.7 Code. K3-256k - та же K3 с окном в 256 тысяч (у Kimi Code
 * она лишь меньше тратит квоту), а цена K3 на API от длины запроса не зависит - поэтому по K3.
 *
 * Запись кеша у K3 платная отдельно (5 минут - цена входа, час - вдвое), прочитанное - только по
 * цене чтения. У K2 цены записи нет: её токены идут по цене входа. Журнал Kimi пишет запись
 * кеша без срока - она считается по 5 минутам, сроку по умолчанию.
 *
 * Модель, которой у Moonshot нет (локальная модель из окружения, чужой провайдер, подключённый
 * в Kimi Code своим ключом: имя ему человек даёт сам), стоимости не получает - ноль честнее
 * чужой цены.
 *
 * Поменялись цены - поправить таблицу и поднять PRICES_VERSION в pricing.ts.
 */

/** Карточка цены; запись кеша null - по цене входа. */
type Card = {
  input: number
  output: number
  cacheRead: number
  cacheWrite5m: number | null
  cacheWrite1h: number | null
}

/** K3: запись кеша на 5 минут - цена входа, на час - вдвое. */
const k3 = (input: number, output: number, cacheRead: number): Card => ({
  input,
  output,
  cacheRead,
  cacheWrite5m: input,
  cacheWrite1h: input * 2,
})

/** K2: цена записи кеша не опубликована. */
const k2 = (input: number, output: number, cacheRead: number): Card => ({
  input,
  output,
  cacheRead,
  cacheWrite5m: null,
  cacheWrite1h: null,
})

/** Ключ - имя модели на платформе. */
const TABLE: Readonly<Record<string, Card>> = {
  'kimi-k3.1-pro': k3(2, 10, 0.2),
  'kimi-k3.1-pro-highspeed': k3(4, 20, 0.2),
  'kimi-k3': k3(3, 15, 0.3),
  'kimi-k2.7-code': k2(0.95, 4, 0.19),
  'kimi-k2.7-code-highspeed': k2(1.9, 8, 0.38),
  'kimi-k2.6': k2(0.95, 4, 0.16),
}

/** Имена Kimi Code, которые не выводятся из имени платформы приставкой `kimi-`. */
const KIMI_CODE: Readonly<Record<string, string>> = {
  'kimi-for-coding': 'kimi-k2.7-code',
  'kimi-for-coding-highspeed': 'kimi-k2.7-code-highspeed',
  'k3-256k': 'kimi-k3',
}

/**
 * Модель платформы по имени из журнала: псевдоним Kimi Code - `провайдер/модель`, у модели
 * Kimi Code нет приставки `kimi-` («k3» - это «kimi-k3», «k3.1-pro» - «kimi-k3.1-pro»).
 */
const platformModelOf = (model: string): string => {
  const name = model.toLowerCase().split('/').pop() ?? ''

  return KIMI_CODE[name] ?? (name.startsWith('kimi-') ? name : `kimi-${name}`)
}

/**
 * Стоимость ответа модели Kimi в долларах; 0 - модель не Moonshot или её цена не известна.
 * Токены - уже в смысле статистики: input - только свежий вход, кеш отдельно.
 */
export const moonshotCostOf = (model: string, tokens: AnswerTokens): number => {
  const rate = TABLE[platformModelOf(model)]

  if (!rate) return 0

  const hour = Math.min(tokens.cacheWrite1h, tokens.cacheWrite)
  const dollars =
    tokens.input * rate.input +
    tokens.output * rate.output +
    tokens.cacheRead * rate.cacheRead +
    (tokens.cacheWrite - hour) * (rate.cacheWrite5m ?? rate.input) +
    hour * (rate.cacheWrite1h ?? rate.input)

  return dollars / 1_000_000
}
