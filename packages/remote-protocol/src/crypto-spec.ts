/**
 * Как обе стороны выводят ключи и доказательства. Само шифрование у каждой своё (IDE -
 * node:crypto, телефон - WebCrypto), а метки, порядок входов и формат - здесь, одни на обе:
 * разошедшиеся на байт стороны обе уверены, что шифруют верно, и не читают друг друга.
 *
 * Схема (P-256, HKDF-SHA256, AES-256-GCM):
 *
 * - Пара: ikm = ECDH(статические) ‖ ECDH(эфемерные) ‖ секрет QR, соль = SHA-256 от
 *   sessionSaltText(...), ключи направлений - HKDF с метками HKDF_INFO. Долгий ключ пары -
 *   HKDF(пустая соль, ECDH(статические), HKDF_INFO.auth).
 * - Переподключение без QR: ikm = ECDH(новые эфемерные) ‖ долгий ключ, та же соль и метки.
 * - nonce = префикс направления (4 байта) ‖ счётчик кадра u64 big-endian; заголовок кадра -
 *   дополнительные данные.
 * - Доказательство телефона - HMAC-SHA256(секрет QR, macInput([PAIR_PROOF_LABEL, agentId,
 *   staticPub телефона, ephemeralPub телефона, deviceId])); ответ IDE - HMAC(секрет QR,
 *   macInput([PAIR_ACK_LABEL, agentId, deviceId, staticPub IDE, ephemeralPub IDE])).
 *
 * Метки - «aw/v1/…», а не «acc/v1/…» amazing-claude-code: телефон ACC не сможет говорить с
 * этой IDE по ошибке, и наоборот, даже через один и тот же релей.
 */

export const HKDF_INFO = {
  agentToDevice: 'aw/v1/agent-to-device',
  deviceToAgent: 'aw/v1/device-to-agent',
  nonceAgentToDevice: 'aw/v1/nonce-a2d',
  nonceDeviceToAgent: 'aw/v1/nonce-d2a',
  auth: 'aw/v1/auth',
} as const

export const PAIR_PROOF_LABEL = 'aw-pair-v1'

export const PAIR_ACK_LABEL = 'aw-pair-ack-v1'

/** Кривая ECDH: P-256 есть у WebCrypto любого телефона, X25519 - не у всех. */
export const CURVE = 'P-256'

export const KEY_BYTES = 32

export const NONCE_PREFIX_BYTES = 4

export const NONCE_BYTES = 12

/** Секрет в QR - 16 байт: не угадать и влезает в код. */
export const QR_SECRET_BYTES = 16

const encoder = new TextEncoder()

/** Текст соли до SHA-256: адреса и эфемерные ключи обеих сторон через «|». */
export const sessionSaltText = (
  agentId: string,
  deviceId: string,
  agentEphemeralPub: string,
  deviceEphemeralPub: string,
): string => `${agentId}|${deviceId}|${agentEphemeralPub}|${deviceEphemeralPub}`

/** Вход HMAC: каждое поле в UTF-8 и нулевой байт за ним - два набора полей не сольются в один. */
export const macInput = (parts: readonly string[]): Uint8Array => {
  const chunks = parts.map((part) => encoder.encode(part))
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length + 1, 0))
  let at = 0

  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length + 1
  }

  return out
}

/** Двенадцать байт nonce: префикс направления и счётчик big-endian. */
export const nonceOf = (prefix: Uint8Array, counter: bigint): Uint8Array => {
  const out = new Uint8Array(NONCE_BYTES)

  out.set(prefix.subarray(0, NONCE_PREFIX_BYTES), 0)
  new DataView(out.buffer).setBigUint64(NONCE_PREFIX_BYTES, BigInt.asUintN(64, counter), false)

  return out
}

/**
 * Отпечаток ключа, как его показывают оба экрана: первые 8 байт SHA-256 от SPKI, четыре
 * группы по четыре знака. Хеш считает сторона своим средством, здесь - только вид.
 */
export const fingerprintOf = (sha256OfSpki: Uint8Array): string =>
  [...sha256OfSpki.subarray(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
    .replace(/(.{4})(?!$)/g, '$1 ')
