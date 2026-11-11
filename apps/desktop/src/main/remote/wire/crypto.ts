import type { KeyObject } from 'node:crypto'
import {
  sign,
  hkdfSync,
  createHash,
  createHmac,
  diffieHellman,
  createCipheriv,
  createPublicKey,
  timingSafeEqual,
  createDecipheriv,
  createPrivateKey,
  generateKeyPairSync,
} from 'node:crypto'

import type { PairRefusal } from '@agentic-workstation/remote-protocol/agent-messages'
import {
  nonceOf,
  macInput,
  HKDF_INFO,
  KEY_BYTES,
  fingerprintOf,
  REVOKED_LABEL,
  PAIR_ACK_LABEL,
  sessionSaltText,
  PAIR_PROOF_LABEL,
  NONCE_PREFIX_BYTES,
  PAIR_REFUSED_LABEL,
} from '@agentic-workstation/remote-protocol/crypto-spec'
import { FRAME_PROOF } from '@agentic-workstation/remote-protocol/frame'
import type { ClaimKind } from '@agentic-workstation/remote-protocol/relay-claim'
import {
  proofBody,
  claimInput,
  addressOfKeyHash,
} from '@agentic-workstation/remote-protocol/relay-claim'

import { buildFrame } from './frame'

/**
 * Половина IDE в запечатанном канале: P-256, HKDF-SHA256, AES-256-GCM на `node:crypto`. Метки,
 * порядок входов и формат - из общего протокола (crypto-spec.ts), телефон считает то же на
 * WebCrypto. Вывод, разошедшийся на байт, даёт две стороны, которые обе уверены, что шифруют
 * верно, и не читают друг друга, - это держат векторы RFC 5869 и сверка с WebCrypto в тесте.
 */

const CURVE = 'prime256v1'

const TAG_BYTES = 16

/** Ключи одного соединения: ключ и префикс nonce на направление, плюс долгий ключ пары. */
export type SessionKeys = {
  toDevice: Buffer
  toAgent: Buffer
  noncePrefixToDevice: Buffer
  noncePrefixToAgent: Buffer
  /** Долгий: по нему пара узнаёт друг друга при переподключении без QR. Им ничего не шифруется. */
  auth: Buffer
}

export type KeyPair = { privateKey: KeyObject; publicKey: KeyObject }

export const generateKeyPair = (): KeyPair => generateKeyPairSync('ec', { namedCurve: CURVE })

/** Публичный ключ на проводе - SPKI в base64: так его отдаёт и WebCrypto. */
export const exportPublic = (key: KeyObject): string =>
  key.export({ type: 'spki', format: 'der' }).toString('base64')

/** Чужой публичный ключ; не P-256 - null, а не исключение посреди разбора кадра. */
export const importPublic = (text: string): KeyObject | null => {
  try {
    const key = createPublicKey({ key: Buffer.from(text, 'base64'), format: 'der', type: 'spki' })

    return key.asymmetricKeyDetails?.namedCurve === CURVE ? key : null
  } catch {
    return null
  }
}

export const exportPrivate = (key: KeyObject): Buffer =>
  key.export({ type: 'pkcs8', format: 'der' })

/** Пара из сохранённого закрытого ключа: открытая половина выводится из него. */
export const restoreKeyPair = (der: Buffer): KeyPair => {
  const privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })

  return { privateKey, publicKey: createPublicKey(privateKey) }
}

/** Общий секрет ECDH - координата x, 32 байта, как deriveBits(256) у WebCrypto. Только через HKDF. */
export const agree = (privateKey: KeyObject, publicKey: KeyObject): Buffer =>
  diffieHellman({ privateKey, publicKey })

/** HKDF-SHA256 (RFC 5869). Пустая соль - нули длины хеша, как требует стандарт. */
export const hkdf = (
  salt: Uint8Array,
  ikm: Uint8Array,
  info: string | Uint8Array,
  bytes: number,
): Buffer =>
  Buffer.from(
    hkdfSync(
      'sha256',
      ikm,
      salt,
      typeof info === 'string' ? Buffer.from(info, 'utf8') : info,
      bytes,
    ),
  )

const sha256 = (data: Uint8Array | string): Buffer => createHash('sha256').update(data).digest()

const sessionSalt = (agentId: string, deviceId: string, agentPub: string, devicePub: string) =>
  sha256(sessionSaltText(agentId, deviceId, agentPub, devicePub))

const directionKeys = (salt: Buffer, ikm: Buffer, auth: Buffer): SessionKeys => ({
  toDevice: hkdf(salt, ikm, HKDF_INFO.agentToDevice, KEY_BYTES),
  toAgent: hkdf(salt, ikm, HKDF_INFO.deviceToAgent, KEY_BYTES),
  noncePrefixToDevice: hkdf(salt, ikm, HKDF_INFO.nonceAgentToDevice, NONCE_PREFIX_BYTES),
  noncePrefixToAgent: hkdf(salt, ikm, HKDF_INFO.nonceDeviceToAgent, NONCE_PREFIX_BYTES),
  auth,
})

/** Долгий ключ пары - из статических половин, пустая соль, своя метка. */
export const longLivedAuth = (staticSecret: Uint8Array): Buffer =>
  hkdf(new Uint8Array(0), staticSecret, HKDF_INFO.auth, KEY_BYTES)

/**
 * Ключи свежей пары. Секрет из QR - тоже вход: релей, державший бы оба закрытых ключа, без
 * кода их не выведет.
 */
export const deriveSession = (input: {
  staticSecret: Buffer
  ephemeralSecret: Buffer
  qrSecret: Buffer
  agentId: string
  deviceId: string
  agentEphemeralPub: string
  deviceEphemeralPub: string
}): SessionKeys =>
  directionKeys(
    sessionSalt(input.agentId, input.deviceId, input.agentEphemeralPub, input.deviceEphemeralPub),
    Buffer.concat([input.staticSecret, input.ephemeralSecret, input.qrSecret]),
    longLivedAuth(input.staticSecret),
  )

/** Переподключение: свежие эфемерные ключи, за которые ручается долгий. Без QR. */
export const resumeSession = (input: {
  auth: Buffer
  ephemeralSecret: Buffer
  agentId: string
  deviceId: string
  agentEphemeralPub: string
  deviceEphemeralPub: string
}): SessionKeys =>
  directionKeys(
    sessionSalt(input.agentId, input.deviceId, input.agentEphemeralPub, input.deviceEphemeralPub),
    Buffer.concat([input.ephemeralSecret, input.auth]),
    input.auth,
  )

const mac = (secret: Uint8Array, parts: readonly string[]): Buffer =>
  createHmac('sha256', secret).update(macInput(parts)).digest()

/** Доказательство телефона, что он видел QR: оба его ключа под ним. */
export const deviceProof = (
  secret: Uint8Array,
  agentId: string,
  deviceStaticPub: string,
  deviceEphemeralPub: string,
  deviceId: string,
): Buffer => mac(secret, [PAIR_PROOF_LABEL, agentId, deviceStaticPub, deviceEphemeralPub, deviceId])

/** И ответ IDE: телефон проверяет его и отпечаток из QR. */
export const agentProof = (
  secret: Uint8Array,
  agentId: string,
  deviceId: string,
  agentStaticPub: string,
  agentEphemeralPub: string,
): Buffer => mac(secret, [PAIR_ACK_LABEL, agentId, deviceId, agentStaticPub, agentEphemeralPub])

/**
 * «Тебя отпустили» под долгим ключом пары: его знают только IDE и этот телефон, поэтому слово
 * с таким тегом не подделает ни релей, ни тот, кто занял бы адрес IDE.
 */
export const revokedTag = (auth: Uint8Array, agentId: string, deviceId: string): Buffer =>
  mac(auth, [REVOKED_LABEL, agentId, deviceId])

/** «Пару не пустили» под секретом QR: сказать это может только тот, кто видел код. */
export const pairRefusedProof = (
  secret: Uint8Array,
  agentId: string,
  deviceId: string,
  reason: PairRefusal,
): Buffer => mac(secret, [PAIR_REFUSED_LABEL, agentId, deviceId, reason])

/**
 * Адрес на релее - начало SHA-256 открытого ключа подписи (relay-claim.ts). Ключ подписи свой,
 * не тот, что в ECDH пары: один ключ на два разных алгоритма - то, чего в криптографии избегают.
 */
export const addressOf = (signingPublic: KeyObject): Buffer =>
  Buffer.from(addressOfKeyHash(sha256(signingPublic.export({ type: 'spki', format: 'der' }))))

/** Ответ на вызов релея: ключ подписи и подпись r‖s - кадр FRAME_PROOF от своего адреса. */
export const claimProof = (
  signing: KeyPair,
  kind: ClaimKind,
  address: Buffer,
  challenge: Uint8Array,
): Buffer => {
  const signature = sign('sha256', claimInput(kind, address.toString('base64url'), challenge), {
    key: signing.privateKey,
    dsaEncoding: 'ieee-p1363',
  })
  const spki = signing.publicKey.export({ type: 'spki', format: 'der' })

  return buildFrame(FRAME_PROOF, Buffer.alloc(16), address, 0n, proofBody(spki, signature))
}

/** AES-256-GCM; заголовок кадра - дополнительные данные. Выход - шифртекст и тег, как у WebCrypto. */
export const seal = (
  key: Uint8Array,
  prefix: Uint8Array,
  counter: bigint,
  header: Uint8Array,
  body: Uint8Array,
): Buffer => {
  const cipher = createCipheriv('aes-256-gcm', key, nonceOf(prefix, counter), {
    authTagLength: TAG_BYTES,
  })

  cipher.setAAD(header)

  return Buffer.concat([cipher.update(body), cipher.final(), cipher.getAuthTag()])
}

/** Открыть тело или null: не открылось - отозванный телефон или кадр правили в пути. */
export const open = (
  key: Uint8Array,
  prefix: Uint8Array,
  counter: bigint,
  header: Uint8Array,
  sealed: Uint8Array,
): Buffer | null => {
  if (sealed.length < TAG_BYTES || counter < 0n) return null

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonceOf(prefix, counter), {
      authTagLength: TAG_BYTES,
    })

    decipher.setAAD(header)
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES))

    return Buffer.concat([
      decipher.update(sealed.subarray(0, sealed.length - TAG_BYTES)),
      decipher.final(),
    ])
  } catch {
    return null
  }
}

/** Отпечаток ключа, как его показывают оба экрана: «0011 2233 4455 6677». */
export const fingerprint = (publicKeySpki: string): string =>
  fingerprintOf(sha256(Buffer.from(publicKeySpki, 'base64')))

/** Сравнение секретов за постоянное время. */
export const sameSecret = (first: Uint8Array, second: Uint8Array): boolean =>
  first.length === second.length && timingSafeEqual(first, second)
