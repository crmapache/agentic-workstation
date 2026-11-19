/**
 * Подпись запросов к магазину (ADR 0091). Личность в магазине - ключ Ed25519 этой IDE, а не
 * аккаунт с паролем: IDE подписывает запрос, сервер проверяет подпись, свежесть и одноразовость.
 * Владелец расширения - ключ, который первым его опубликовал.
 */

export const STORE_HEADERS = {
  key: 'x-aw-key',
  time: 'x-aw-time',
  nonce: 'x-aw-nonce',
  signature: 'x-aw-signature',
} as const

/** Насколько часы IDE и сервера могут расходиться. */
export const SIGNATURE_WINDOW_MS = 5 * 60 * 1000

/** Что подписывается: метод, путь с запросом, время, разовое число и отпечаток тела (hex sha256). */
export const signingText = (parts: {
  method: string
  path: string
  time: string
  nonce: string
  bodyHash: string
}): string =>
  [
    'aw-store/v1',
    parts.method.toUpperCase(),
    parts.path,
    parts.time,
    parts.nonce,
    parts.bodyHash,
  ].join('\n')

/** Публичный ключ - 32 байта Ed25519 в base64url: 43 знака. */
export const PUBLIC_KEY = /^[A-Za-z0-9_-]{43}$/

/** Адрес магазина по умолчанию; IDE и проверки могут подставить свой. */
export const STORE_URL = 'https://agentic-workstation-store.mzpizote.com'
