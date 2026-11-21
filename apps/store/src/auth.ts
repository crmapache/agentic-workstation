import { verify, createHash, createPublicKey } from 'node:crypto'

import { publisherIdOf } from '@agentic-workstation/store-protocol/node-signer'
import {
  PUBLIC_KEY,
  signingText,
  STORE_HEADERS,
  SIGNATURE_WINDOW_MS,
} from '@agentic-workstation/store-protocol/signing'

import { NonceBook } from './nonces.ts'

/** Кто подписал запрос: ключ (base64url) и короткий id издателя для людей. */
export type Signer = { key: string; id: string }

/** overloaded - книга разовых чисел полна: магазин перегружен, отвечает 503. */
export type SignatureCheck =
  { ok: true; signer: Signer } | { ok: false; error: 'unsigned' | 'bad-signature' | 'overloaded' }

/** Сколько разовых чисел помнить разом: запись в магазин редка, потолок - с большим запасом. */
const MAX_NONCES = 100_000

/** id издателя - начало отпечатка ключа (общий с IDE расчёт). */
export const publisherId = publisherIdOf

/**
 * Проверка подписи запроса (store-protocol/signing): ключ Ed25519, время в окне, разовое число
 * не повторялось, подпись сходится с методом, путём и отпечатком тела. Повтор перехваченного
 * запроса не пройдёт: число запомнено, пока подпись годна (книга в два поколения, nonces.ts).
 */
export class SignatureDesk {
  private readonly nonces: NonceBook
  private readonly now: () => number

  constructor(now: () => number = Date.now, maxNonces = MAX_NONCES) {
    this.now = now
    this.nonces = new NonceBook({ keepMs: SIGNATURE_WINDOW_MS * 2, cap: maxNonces }, now())
  }

  check(request: {
    method: string
    path: string
    headers: Record<string, string | string[] | undefined>
    body: Buffer
  }): SignatureCheck {
    const header = (name: string) => {
      const value = request.headers[name]

      return typeof value === 'string' ? value : ''
    }
    const key = header(STORE_HEADERS.key)
    const time = header(STORE_HEADERS.time)
    const nonce = header(STORE_HEADERS.nonce)
    const signature = header(STORE_HEADERS.signature)

    if (!key || !time || !nonce || !signature) return { ok: false, error: 'unsigned' }
    if (!PUBLIC_KEY.test(key) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce))
      return { ok: false, error: 'bad-signature' }

    const at = Number(time)
    const now = this.now()

    if (!Number.isFinite(at) || Math.abs(now - at) > SIGNATURE_WINDOW_MS)
      return { ok: false, error: 'bad-signature' }

    if (this.nonces.has(`${key}:${nonce}`, now)) return { ok: false, error: 'bad-signature' }
    if (this.nonces.isFull(now)) return { ok: false, error: 'overloaded' }

    const text = signingText({
      method: request.method,
      path: request.path,
      time,
      nonce,
      bodyHash: createHash('sha256').update(request.body).digest('hex'),
    })

    try {
      const publicKey = createPublicKey({
        key: { kty: 'OKP', crv: 'Ed25519', x: key },
        format: 'jwk',
      })

      if (!verify(null, Buffer.from(text), publicKey, Buffer.from(signature, 'base64url'))) {
        return { ok: false, error: 'bad-signature' }
      }
    } catch {
      return { ok: false, error: 'bad-signature' }
    }

    this.nonces.add(`${key}:${nonce}`, now)

    return { ok: true, signer: { key, id: publisherId(key) } }
  }
}
