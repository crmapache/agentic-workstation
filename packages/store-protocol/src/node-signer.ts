import { sign, createHash, randomBytes, createPrivateKey, generateKeyPairSync } from 'node:crypto'

import { signingText, STORE_HEADERS } from './signing.ts'

/** Пара ключей IDE для магазина: открытый - base64url 32 байт, закрытый - JWK строкой (d). */
export type StoreKeys = { publicKey: string; privateKey: string }

/** Новая пара Ed25519: закрытый ключ IDE хранит в хранилище ключей, наружу он не уходит. */
export const newStoreKeys = (): StoreKeys => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const jwk = privateKey.export({ format: 'jwk' })

  return { publicKey: String(publicKey.export({ format: 'jwk' }).x), privateKey: String(jwk.d) }
}

/**
 * Заголовки подписанного запроса к магазину: ключ, время, разовое число и подпись текста из
 * signingText. path - путь с запросом, ровно как уходит в адрес.
 */
export const signedHeaders = (
  keys: StoreKeys,
  request: { method: string; path: string; body: string },
  now: number = Date.now(),
): Record<string, string> => {
  const time = String(now)
  const nonce = randomBytes(18).toString('base64url')
  const text = signingText({
    method: request.method,
    path: request.path,
    time,
    nonce,
    bodyHash: createHash('sha256').update(request.body).digest('hex'),
  })
  const privateKey = createPrivateKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: keys.publicKey, d: keys.privateKey },
    format: 'jwk',
  })

  return {
    [STORE_HEADERS.key]: keys.publicKey,
    [STORE_HEADERS.time]: time,
    [STORE_HEADERS.nonce]: nonce,
    [STORE_HEADERS.signature]: sign(null, Buffer.from(text), privateKey).toString('base64url'),
  }
}

/** id издателя - начало отпечатка ключа: короче ключа и у одного ключа всегда один. */
export const publisherIdOf = (publicKey: string): string =>
  createHash('sha256').update(publicKey).digest('base64url').slice(0, 12)
