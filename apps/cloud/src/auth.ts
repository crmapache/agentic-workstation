import { verify, createHash, createPublicKey } from 'node:crypto'

import { accountIdOf } from '@agentic-workstation/cloud-protocol/node-account'
import {
  NONCE,
  PUBLIC_KEY,
  signingText,
  CLOUD_HEADERS,
  SIGNATURE_WINDOW_MS,
} from '@agentic-workstation/cloud-protocol/signing'

/** Кто подписал запрос: открытый ключ аккаунта (base64url) и короткий id для журнала. */
export type Signer = { key: string; id: string }

export type SignatureCheck =
  { ok: true; signer: Signer } | { ok: false; error: 'unsigned' | 'bad-signature' }

/** Сколько разовых чисел держать, прежде чем выметать просроченные. */
const SWEEP_AT = 10_000

/**
 * Проверка подписи запроса (cloud-protocol/signing): ключ Ed25519, время в окне, разовое число
 * не повторялось, подпись сходится с методом, путём с запросом и отпечатком тела. Повтор
 * перехваченного запроса не пройдёт: число запомнено на всё окно времени. Подпись магазина сюда
 * не подходит - у текста облака своя метка.
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
    const key = header(CLOUD_HEADERS.key)
    const time = header(CLOUD_HEADERS.time)
    const nonce = header(CLOUD_HEADERS.nonce)
    const signature = header(CLOUD_HEADERS.signature)

    if (!key || !time || !nonce || !signature) return { ok: false, error: 'unsigned' }
    if (!PUBLIC_KEY.test(key) || !NONCE.test(nonce)) return { ok: false, error: 'bad-signature' }

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

    return { ok: true, signer: { key, id: accountIdOf(key) } }
  }

  private forgetOld(now: number) {
    if (this.seen.size < SWEEP_AT) return

    for (const [entry, at] of this.seen) {
      if (now - at > SIGNATURE_WINDOW_MS * 2) this.seen.delete(entry)
    }
  }
}
