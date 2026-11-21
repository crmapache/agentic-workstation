import { verify, createHash, createPublicKey } from 'node:crypto'

import { accountIdOf } from '@agentic-workstation/cloud-protocol/node-account'
import {
  TIME,
  NONCE,
  SIGNATURE,
  PUBLIC_KEY,
  signingText,
  CLOUD_HEADERS,
  SIGNATURE_WINDOW_MS,
} from '@agentic-workstation/cloud-protocol/signing'

import { NonceBook } from './nonces.ts'

/** Кто подписал запрос: открытый ключ аккаунта (base64url) и короткий id для журнала. */
export type Signer = { key: string; id: string }

/** Отказ: без подписи, подпись не та (или повтор), книга разовых чисел полна (сервер занят). */
export type SignatureRefusal = { ok: false; error: 'unsigned' | 'bad-signature' | 'overloaded' }

export type HeadCheck = { ok: true } | SignatureRefusal

export type SignatureCheck = { ok: true; signer: Signer } | SignatureRefusal

/** Что подписано, кроме тела: всё это известно до его чтения. */
export type SignedHead = {
  method: string
  /** Путь с запросом ровно как пришёл. */
  url: string
  /** Заголовок Host: за Traefik - публичный домен облака. */
  host: string
  headers: Record<string, string | string[] | undefined>
}

type Parts = { key: string; time: string; nonce: string; signature: string }

/**
 * Проверка подписи запроса (cloud-protocol/signing): ключ Ed25519, время в окне, разовое число
 * не повторялось, подпись сходится с методом, хостом, путём с запросом и отпечатком тела. Повтор
 * перехваченного запроса не пройдёт: число запомнено, пока подпись годна. Подпись магазина сюда
 * не подходит - у текста облака своя метка.
 *
 * Проверка в два шага: precheck - по заголовкам, до чтения тела (неподписанный и повторный
 * запрос не занимает память сервера телом), check - с телом, целиком. Число запоминается
 * только после верной подписи: чужой запрос не сожжёт число, которое потом пришлёт IDE.
 */
export class SignatureDesk {
  private readonly nonces: NonceBook
  private readonly now: () => number

  constructor(options: { maxNonces: number }, now: () => number = Date.now) {
    this.now = now
    this.nonces = new NonceBook({ keepMs: SIGNATURE_WINDOW_MS * 2, cap: options.maxNonces }, now())
  }

  /** До чтения тела: заголовки на месте и в форме, время в окне, число не повторялось. */
  precheck(head: SignedHead): HeadCheck {
    const parts = this.partsOf(head, this.now())

    return 'error' in parts ? parts : { ok: true }
  }

  /** С телом: всё то же и сама подпись; верная - число запоминается. */
  check(head: SignedHead, body: Buffer): SignatureCheck {
    const now = this.now()
    const parts = this.partsOf(head, now)

    if ('error' in parts) return parts

    const text = signingText({
      method: head.method,
      host: head.host,
      path: head.url,
      time: parts.time,
      nonce: parts.nonce,
      bodyHash: createHash('sha256').update(body).digest('hex'),
    })

    try {
      const publicKey = createPublicKey({
        key: { kty: 'OKP', crv: 'Ed25519', x: parts.key },
        format: 'jwk',
      })

      if (!verify(null, Buffer.from(text), publicKey, Buffer.from(parts.signature, 'base64url')))
        return { ok: false, error: 'bad-signature' }
    } catch {
      return { ok: false, error: 'bad-signature' }
    }

    this.nonces.add(parts.nonce, now)

    return { ok: true, signer: { key: parts.key, id: accountIdOf(parts.key) } }
  }

  private partsOf(head: SignedHead, now: number): Parts | SignatureRefusal {
    const header = (name: string) => {
      const value = head.headers[name]

      return typeof value === 'string' ? value : ''
    }
    const parts = {
      key: header(CLOUD_HEADERS.key),
      time: header(CLOUD_HEADERS.time),
      nonce: header(CLOUD_HEADERS.nonce),
      signature: header(CLOUD_HEADERS.signature),
    }

    if (!parts.key || !parts.time || !parts.nonce || !parts.signature)
      return { ok: false, error: 'unsigned' }

    if (
      !PUBLIC_KEY.test(parts.key) ||
      !NONCE.test(parts.nonce) ||
      !TIME.test(parts.time) ||
      !SIGNATURE.test(parts.signature) ||
      Math.abs(now - Number(parts.time)) > SIGNATURE_WINDOW_MS ||
      // Разовое число помнится без ключа: у IDE оно - 18 случайных байт, совпасть у двух
      // аккаунтов не может, а память на запись вдвое меньше.
      this.nonces.has(parts.nonce, now)
    )
      return { ok: false, error: 'bad-signature' }

    if (this.nonces.isFull(now)) return { ok: false, error: 'overloaded' }

    return parts
  }
}
