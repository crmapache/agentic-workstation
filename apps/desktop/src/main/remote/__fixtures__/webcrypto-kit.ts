import { webcrypto } from 'node:crypto'

import { toBase64, fromBase64 } from '@agentic-workstation/remote-protocol/base64'
import { macInput, HKDF_INFO } from '@agentic-workstation/remote-protocol/crypto-spec'
import { addressOfKeyHash } from '@agentic-workstation/remote-protocol/relay-claim'

/**
 * Примитивы WebCrypto для подделки телефона (webcrypto-phone.ts): ключи, HKDF, HMAC, AES-GCM,
 * подпись адреса - тем же API, что у браузера телефона, и независимо от node:crypto IDE.
 */

export type Key = webcrypto.CryptoKey

export type Pair = { publicKey: Key; privateKey: Key }

export const { subtle } = webcrypto

export const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const

export type Message = Record<string, unknown> & { k: string }

export type PhoneKeys = {
  toAgent: Uint8Array
  fromAgent: Uint8Array
  prefixToAgent: Uint8Array
  prefixFromAgent: Uint8Array
}

export const keyPair = (): Promise<Pair> => subtle.generateKey(ECDH, true, ['deriveBits'])

export const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const

/** Ключ подписи телефона: адрес на релее - начало SHA-256 его открытой половины. */
export type Signing = { pair: Pair; spki: Uint8Array; address: Uint8Array }

export const signingKey = async (): Promise<Signing> => {
  const pair = await subtle.generateKey(ECDSA, false, ['sign', 'verify'])
  const spki = new Uint8Array(await subtle.exportKey('spki', pair.publicKey))

  return { pair, spki, address: addressOfKeyHash(await sha256(spki)) }
}

export const spki = async (key: Key) =>
  toBase64(new Uint8Array(await subtle.exportKey('spki', key)))

export const agree = async (privateKey: Key, pub: string) =>
  new Uint8Array(
    await subtle.deriveBits(
      {
        name: 'ECDH',
        public: await subtle.importKey(
          'spki',
          fromBase64(pub) ?? new Uint8Array(0),
          ECDH,
          true,
          [],
        ),
      },
      privateKey,
      256,
    ),
  )

export const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: string, bytes: number) =>
  new Uint8Array(
    await subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) },
      await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']),
      bytes * 8,
    ),
  )

export const mac = async (secret: Uint8Array, parts: string[]) =>
  new Uint8Array(
    await subtle.sign(
      'HMAC',
      await subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
      macInput(parts),
    ),
  )

export const sha256 = async (data: Uint8Array) =>
  new Uint8Array(await subtle.digest('SHA-256', data))

export const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0

  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }

  return out
}

/** Ключи направлений, как у IDE: соль - SHA-256 текста соли, метки - aw/v1. */
export const directionKeys = async (salt: Uint8Array, ikm: Uint8Array): Promise<PhoneKeys> => ({
  fromAgent: await hkdf(salt, ikm, HKDF_INFO.agentToDevice, 32),
  toAgent: await hkdf(salt, ikm, HKDF_INFO.deviceToAgent, 32),
  prefixFromAgent: await hkdf(salt, ikm, HKDF_INFO.nonceAgentToDevice, 4),
  prefixToAgent: await hkdf(salt, ikm, HKDF_INFO.nonceDeviceToAgent, 4),
})

export const aes = async (
  raw: Uint8Array,
  usage: 'encrypt' | 'decrypt',
  iv: Uint8Array,
  header: Uint8Array,
  data: Uint8Array,
) => {
  const key = await subtle.importKey('raw', raw, 'AES-GCM', false, [usage])
  const params = { name: 'AES-GCM', iv, additionalData: header, tagLength: 128 }

  return new Uint8Array(
    usage === 'encrypt'
      ? await subtle.encrypt(params, key, data)
      : await subtle.decrypt(params, key, data),
  )
}

/** Ждать, пока условие станет правдой; не дождались - ошибка с подписью. */
export const until = async <T>(
  probe: () => T | null | undefined,
  what: string,
  timeout = 3000,
): Promise<T> => {
  for (let waited = 0; waited < timeout; waited += 10) {
    const value = probe()

    if (value !== null && value !== undefined) return value

    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error(`timed out waiting for ${what}`)
}
