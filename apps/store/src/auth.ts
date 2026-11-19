import { verify, createHash, createPublicKey } from 'node:crypto'

import { publisherIdOf } from '@agentic-workstation/store-protocol/node-signer'
import {
  PUBLIC_KEY,
  signingText,
  STORE_HEADERS,
  SIGNATURE_WINDOW_MS,
} from '@agentic-workstation/store-protocol/signing'

/** Кто подписал запрос: ключ (base64url) и короткий id издателя для людей. */
export type Signer = { key: string; id: string }

export type SignatureCheck =
  { ok: true; signer: Signer } | { ok: false; error: 'unsigned' | 'bad-signature' }

/** id издателя - начало отпечатка ключа (общий с IDE расчёт). */
export const publisherId = publisherIdOf

/**
 * Проверка подписи запроса (store-protocol/signing): ключ Ed25519, время в окне, разовое число
 * не повторялось, подпись сходится с методом, путём и отпечатком тела. Повтор перехваченного
 * запроса не пройдёт: число запомнено на всё окно времени.
 */
export class SignatureDesk {
  private readonly seen = new Map<string, number>()
  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
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

    this.forgetOld(now)

    if (this.seen.has(`${key}:${nonce}`)) return { ok: false, error: 'bad-signature' }

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

    this.seen.set(`${key}:${nonce}`, at)

    return { ok: true, signer: { key, id: publisherId(key) } }
  }

  private forgetOld(now: number) {
    if (this.seen.size < 10_000) return

    for (const [entry, at] of this.seen) {
      if (now - at > SIGNATURE_WINDOW_MS * 2) this.seen.delete(entry)
    }
  }
}
