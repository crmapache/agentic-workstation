/**
 * Взаимная проверка IDE и native host перед первым кадром (ADR 0048). На маке сокет моста
 * закрыт правами файла, а именованный канал Windows лежит в общем пространстве имён машины:
 * его может открыть раньше IDE чужой процесс, и host отдал бы ему расширение в настоящем Chrome
 * человека. Поэтому обе стороны доказывают, что знают ключ из папки моста (доступной только
 * человеку), - HMAC над случайным числом другой стороны. Криптография - WebCrypto: она есть и в
 * Node, и в браузере, а Node в этом пакете нельзя.
 *
 *   IDE  → host: `auth-hub <число IDE>`
 *   host → IDE : `auth-host <доказательство host> <число host>`
 *   IDE  → host: `auth-ok <доказательство IDE>`
 */
export const AUTH_HUB = 'auth-hub'
export const AUTH_HOST = 'auth-host'
export const AUTH_OK = 'auth-ok'

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

const randomHex = (length: number): string =>
  hex(globalThis.crypto.getRandomValues(new Uint8Array(length)))

/** Случайное число одной стороны: повтор подслушанного ответа ничего не даст. */
export const newNonce = (): string => randomHex(16)

/** Новый ключ моста: 32 случайных байта. */
export const newBridgeKey = (): string => randomHex(32)

/** Доказательство стороны: HMAC-SHA256 ключа над её именем и числом другой стороны. */
export const proofOf = async (
  key: string,
  side: 'hub' | 'host',
  nonce: string,
): Promise<string> => {
  const encoder = new TextEncoder()
  const hmac = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  return hex(
    new Uint8Array(
      await globalThis.crypto.subtle.sign('HMAC', hmac, encoder.encode(`${side}|${nonce}`)),
    ),
  )
}

/** Сверка доказательств за равное время: по времени ответа ключ не подобрать. */
export const sameProof = (got: string, expected: string): boolean => {
  if (got.length !== expected.length) return false

  let difference = 0

  for (let index = 0; index < got.length; index += 1) {
    difference |= got.charCodeAt(index) ^ expected.charCodeAt(index)
  }

  return difference === 0
}
