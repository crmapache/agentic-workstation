import { sign, createHash, randomBytes } from 'node:crypto'

import type { CloudAccount } from './node-account.ts'
import { signingText, CLOUD_HEADERS } from './signing.ts'

/**
 * Заголовки подписанного запроса к облаку: ключ, время, разовое число и подпись текста из
 * signingText. path - путь с запросом, ровно как уходит в адрес.
 */
export const signedHeaders = (
  account: Pick<CloudAccount, 'publicKey' | 'signingKey'>,
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

  return {
    [CLOUD_HEADERS.key]: account.publicKey,
    [CLOUD_HEADERS.time]: time,
    [CLOUD_HEADERS.nonce]: nonce,
    [CLOUD_HEADERS.signature]: sign(null, Buffer.from(text), account.signingKey).toString(
      'base64url',
    ),
  }
}
