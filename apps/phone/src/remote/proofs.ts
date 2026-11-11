import type { PairRefusal } from '@agentic-workstation/remote-protocol/agent-messages'
import { fromBase64, toBase64Url } from '@agentic-workstation/remote-protocol/base64'
import {
  CURVE,
  macInput,
  HKDF_INFO,
  KEY_BYTES,
  REVOKED_LABEL,
  PAIR_REFUSED_LABEL,
} from '@agentic-workstation/remote-protocol/crypto-spec'
import { encodeFrame, FRAME_PROOF } from '@agentic-workstation/remote-protocol/frame'
import type { ClaimKind } from '@agentic-workstation/remote-protocol/relay-claim'
import {
  proofBody,
  claimInput,
  addressOfKeyHash,
} from '@agentic-workstation/remote-protocol/relay-claim'

import { agree, sha256 } from './crypto'

/**
 * Доказательства телефона, кроме шифра канала: право на свой адрес у релея и проверка слов
 * IDE, которым нельзя верить без подписи, - «тебя отпустили» и «пару не пустили». Закрытые ключи
 * - неизвлекаемые CryptoKey: подписать и сверить ими можно, выгрузить - нет.
 */

const ECDSA = { name: 'ECDSA', namedCurve: CURVE } as const

const subtle = (): SubtleCrypto => globalThis.crypto.subtle

const own = (data: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(data)

/** Ключ подписи телефона и адрес из него (relay-claim.ts): закрытая половина не выгружается. */
export type SigningIdentity = { deviceId: string; signingKey: CryptoKey; signingSpki: Uint8Array }

export const newSigningIdentity = async (): Promise<SigningIdentity> => {
  const pair = await subtle().generateKey(ECDSA, false, ['sign', 'verify'])
  const signingSpki = new Uint8Array(await subtle().exportKey('spki', pair.publicKey))

  return {
    deviceId: toBase64Url(addressOfKeyHash(await sha256(signingSpki))),
    signingKey: pair.privateKey,
    signingSpki,
  }
}

/** Ответ на вызов релея: кадр с ключом подписи и подписью r‖s над текстом входа устройства. */
export const claimFrame = async (
  identity: { signingKey: CryptoKey; signingSpki: Uint8Array },
  address: Uint8Array,
  challenge: Uint8Array,
  kind: ClaimKind = 'device',
): Promise<Uint8Array> => {
  const signature = new Uint8Array(
    await subtle().sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      identity.signingKey,
      own(claimInput(kind, toBase64Url(address), challenge)),
    ),
  )

  return encodeFrame(
    FRAME_PROOF,
    new Uint8Array(16),
    address,
    0n,
    proofBody(identity.signingSpki, signature),
  )
}

const hmacVerify = async (key: CryptoKey, tag: string, parts: string[]): Promise<boolean> => {
  const bytes = fromBase64(tag)

  return !!bytes && subtle().verify('HMAC', key, own(bytes), own(macInput(parts)))
}

/**
 * «Тебя отпустили» - правда, только если тег сходится с долгим ключом этой пары: его знают
 * только IDE и телефон (ECDH статических ключей), ни релей, ни занявший адрес IDE его не
 * подделает. Долгий ключ выводится прямо в неизвлекаемый ключ HMAC.
 */
export const revokedTagValid = async (
  pair: { staticPrivateKey: CryptoKey; agentStaticPub: string; agentId: string },
  deviceId: string,
  tag: string,
): Promise<boolean> => {
  try {
    const shared = await agree(pair.staticPrivateKey, pair.agentStaticPub)
    const base = await subtle().importKey('raw', own(shared), 'HKDF', false, ['deriveKey'])
    const auth = await subtle().deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(0),
        info: new TextEncoder().encode(HKDF_INFO.auth),
      },
      base,
      { name: 'HMAC', hash: 'SHA-256', length: KEY_BYTES * 8 },
      false,
      ['verify'],
    )

    return await hmacVerify(auth, tag, [REVOKED_LABEL, pair.agentId, deviceId])
  } catch {
    return false
  }
}

/** «Пару не пустили» - правда, только если подписано секретом кода, который телефон открыл. */
export const pairRefusedValid = async (
  secret: Uint8Array,
  input: { agentId: string; deviceId: string; reason: PairRefusal; proof: string },
): Promise<boolean> => {
  const key = await subtle().importKey(
    'raw',
    own(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  return hmacVerify(key, input.proof, [
    PAIR_REFUSED_LABEL,
    input.agentId,
    input.deviceId,
    input.reason,
  ])
}
