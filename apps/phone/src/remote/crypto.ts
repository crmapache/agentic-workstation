import { toBase64, fromBase64 } from '@agentic-workstation/remote-protocol/base64'
import {
  CURVE,
  nonceOf,
  macInput,
  HKDF_INFO,
  KEY_BYTES,
  fingerprintOf,
  PAIR_ACK_LABEL,
  sessionSaltText,
  PAIR_PROOF_LABEL,
  NONCE_PREFIX_BYTES,
} from '@agentic-workstation/remote-protocol/crypto-spec'

/**
 * Половина телефона в запечатанном канале: P-256, HKDF-SHA256, AES-256-GCM на WebCrypto. Метки,
 * порядок входов и формат - из общего протокола (crypto-spec.ts), IDE считает то же на
 * node:crypto. Ключи AES выводятся сразу неизвлекаемыми CryptoKey: байты ключей соединения в
 * JavaScript не появляются вовсе. Сверку с IDE держит тест против настоящего агента.
 */

const ECDH = { name: 'ECDH', namedCurve: CURVE } as const

/** Ключи соединения с одной IDE: AES - неизвлекаемые CryptoKey, префиксы nonce - байты. */
export type SessionKeys = {
  toAgent: CryptoKey
  fromAgent: CryptoKey
  prefixToAgent: Uint8Array
  prefixFromAgent: Uint8Array
}

const TAG_BITS = 128

const encoder = new TextEncoder()

const subtle = (): SubtleCrypto => globalThis.crypto.subtle

/**
 * Свой буфер для WebCrypto: протокол отдаёт Uint8Array над любым буфером, а WebCrypto требует
 * ArrayBuffer. Копия в десятки байт ничего не стоит.
 */
const own = (data: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(data)

export const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0

  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }

  return out
}

/**
 * Пара ключей ECDH. Закрытый - неизвлекаемый: его нельзя выгрузить даже своему коду, а
 * IndexedDB хранит его как есть. Открытый WebCrypto отдаёт всегда.
 */
export const generateKeyPair = (): Promise<CryptoKeyPair> =>
  subtle().generateKey(ECDH, false, ['deriveBits'])

/** Открытый ключ на проводе - SPKI в base64, как его пишет и IDE. */
export const exportPublic = async (key: CryptoKey): Promise<string> =>
  toBase64(new Uint8Array(await subtle().exportKey('spki', key)))

/** Общий секрет ECDH, 32 байта. Кривой ключ собеседника - исключение: рукопожатие не идёт. */
export const agree = async (privateKey: CryptoKey, publicSpki: string): Promise<Uint8Array> => {
  const spki = fromBase64(publicSpki)

  if (!spki) throw new Error('not a public key')

  const publicKey = await subtle().importKey('spki', own(spki), ECDH, true, [])

  return new Uint8Array(
    await subtle().deriveBits({ name: 'ECDH', public: publicKey }, privateKey, KEY_BYTES * 8),
  )
}

export const sha256 = async (data: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await subtle().digest('SHA-256', own(data)))

const hkdfBase = (ikm: Uint8Array) =>
  subtle().importKey('raw', own(ikm), 'HKDF', false, ['deriveBits', 'deriveKey'])

const hkdfParams = (salt: Uint8Array, info: string): HkdfParams => ({
  name: 'HKDF',
  hash: 'SHA-256',
  salt: own(salt),
  info: encoder.encode(info),
})

/** HKDF-SHA256 байтами: префиксы nonce и долгий ключ пары. */
export const hkdfBits = async (
  salt: Uint8Array,
  ikm: Uint8Array,
  info: string,
  bytes: number,
): Promise<Uint8Array> =>
  new Uint8Array(await subtle().deriveBits(hkdfParams(salt, info), await hkdfBase(ikm), bytes * 8))

const hkdfAesKey = async (
  salt: Uint8Array,
  ikm: Uint8Array,
  info: string,
  usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> =>
  subtle().deriveKey(
    hkdfParams(salt, info),
    await hkdfBase(ikm),
    { name: 'AES-GCM', length: KEY_BYTES * 8 },
    false,
    [usage],
  )

const directionKeys = async (salt: Uint8Array, ikm: Uint8Array): Promise<SessionKeys> => ({
  toAgent: await hkdfAesKey(salt, ikm, HKDF_INFO.deviceToAgent, 'encrypt'),
  fromAgent: await hkdfAesKey(salt, ikm, HKDF_INFO.agentToDevice, 'decrypt'),
  prefixToAgent: await hkdfBits(salt, ikm, HKDF_INFO.nonceDeviceToAgent, NONCE_PREFIX_BYTES),
  prefixFromAgent: await hkdfBits(salt, ikm, HKDF_INFO.nonceAgentToDevice, NONCE_PREFIX_BYTES),
})

const sessionSalt = (
  agentId: string,
  deviceId: string,
  agentEphemeralPub: string,
  deviceEphemeralPub: string,
) =>
  sha256(encoder.encode(sessionSaltText(agentId, deviceId, agentEphemeralPub, deviceEphemeralPub)))

/** Кто с кем и чьими эфемерными ключами: соль соединения. */
export type SessionPeers = {
  agentId: string
  deviceId: string
  agentEphemeralPub: string
  deviceEphemeralPub: string
}

/**
 * Ключи свежей пары: статические, эфемерные и секрет QR. Релей, державший бы оба закрытых
 * ключа, без кода из QR их не выведет.
 */
export const derivePairKeys = async (
  input: SessionPeers & {
    staticPrivate: CryptoKey
    agentStaticPub: string
    ephemeralPrivate: CryptoKey
    qrSecret: Uint8Array
  },
): Promise<SessionKeys> =>
  directionKeys(
    await sessionSalt(
      input.agentId,
      input.deviceId,
      input.agentEphemeralPub,
      input.deviceEphemeralPub,
    ),
    concat(
      await agree(input.staticPrivate, input.agentStaticPub),
      await agree(input.ephemeralPrivate, input.agentEphemeralPub),
      input.qrSecret,
    ),
  )

/**
 * Переподключение без QR: свежие эфемерные ключи, за которые ручается долгий ключ пары. Долгий
 * не хранится байтами - он каждый раз выводится заново из неизвлекаемого закрытого ключа.
 */
export const deriveResumeKeys = async (
  input: SessionPeers & {
    staticPrivate: CryptoKey
    agentStaticPub: string
    ephemeralPrivate: CryptoKey
  },
): Promise<SessionKeys> => {
  const auth = await hkdfBits(
    new Uint8Array(0),
    await agree(input.staticPrivate, input.agentStaticPub),
    HKDF_INFO.auth,
    KEY_BYTES,
  )

  return directionKeys(
    await sessionSalt(
      input.agentId,
      input.deviceId,
      input.agentEphemeralPub,
      input.deviceEphemeralPub,
    ),
    concat(await agree(input.ephemeralPrivate, input.agentEphemeralPub), auth),
  )
}

const hmacKey = (secret: Uint8Array, usage: 'sign' | 'verify') =>
  subtle().importKey('raw', own(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])

/** Доказательство телефона, что он видел QR: оба его ключа и адрес под секретом из кода. */
export const deviceProof = async (
  secret: Uint8Array,
  input: { agentId: string; staticPub: string; ephemeralPub: string; deviceId: string },
): Promise<string> =>
  toBase64(
    new Uint8Array(
      await subtle().sign(
        'HMAC',
        await hmacKey(secret, 'sign'),
        own(
          macInput([
            PAIR_PROOF_LABEL,
            input.agentId,
            input.staticPub,
            input.ephemeralPub,
            input.deviceId,
          ]),
        ),
      ),
    ),
  )

/** Ответ IDE на пару: её ключи под тем же секретом. Сверка - за постоянное время (verify). */
export const agentProofValid = async (
  secret: Uint8Array,
  input: {
    agentId: string
    deviceId: string
    agentStaticPub: string
    agentEphemeralPub: string
    proof: string
  },
): Promise<boolean> => {
  const proof = fromBase64(input.proof)

  if (!proof) return false

  return subtle().verify(
    'HMAC',
    await hmacKey(secret, 'verify'),
    own(proof),
    own(
      macInput([
        PAIR_ACK_LABEL,
        input.agentId,
        input.deviceId,
        input.agentStaticPub,
        input.agentEphemeralPub,
      ]),
    ),
  )
}

/** Отпечаток ключа без пробелов, как в QR: «0011223344556677». */
export const compactFingerprint = async (publicSpki: string): Promise<string> =>
  fingerprintOf(await sha256(fromBase64(publicSpki) ?? new Uint8Array(0))).replaceAll(' ', '')

/** AES-256-GCM; заголовок кадра - дополнительные данные, выход - шифртекст и тег. */
export const seal = async (
  key: CryptoKey,
  prefix: Uint8Array,
  counter: bigint,
  header: Uint8Array,
  body: Uint8Array,
): Promise<Uint8Array> =>
  new Uint8Array(
    await subtle().encrypt(
      {
        name: 'AES-GCM',
        iv: own(nonceOf(prefix, counter)),
        additionalData: own(header),
        tagLength: TAG_BITS,
      },
      key,
      own(body),
    ),
  )

/** Открыть тело или null: не открылось - чужие ключи (IDE перезапускалась) или кадр правили. */
export const open = async (
  key: CryptoKey,
  prefix: Uint8Array,
  counter: bigint,
  header: Uint8Array,
  sealed: Uint8Array,
): Promise<Uint8Array | null> => {
  try {
    return new Uint8Array(
      await subtle().decrypt(
        {
          name: 'AES-GCM',
          iv: own(nonceOf(prefix, counter)),
          additionalData: own(header),
          tagLength: TAG_BITS,
        },
        key,
        own(sealed),
      ),
    )
  } catch {
    return null
  }
}
