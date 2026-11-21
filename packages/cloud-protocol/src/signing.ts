/**
 * Подпись запросов к облаку (ADR 0102). Личность - ключ Ed25519, выведенный из ключа аккаунта:
 * любая IDE с тем же ключом аккаунта подписывает тем же ключом и видит те же записи. Сервер
 * проверяет подпись, свежесть и одноразовость, как магазин расширений (ADR 0091), но со своей
 * меткой текста: подпись к магазину облаку не подходит и наоборот.
 */

export const CLOUD_HEADERS = {
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
    'aw-cloud/v1',
    parts.method.toUpperCase(),
    parts.path,
    parts.time,
    parts.nonce,
    parts.bodyHash,
  ].join('\n')

/** Публичный ключ - 32 байта Ed25519 в base64url: 43 знака. */
export const PUBLIC_KEY = /^[A-Za-z0-9_-]{43}$/

/** Разовое число запроса. */
export const NONCE = /^[A-Za-z0-9_-]{16,64}$/
