import { verify, createHash, randomBytes, createPublicKey } from 'node:crypto'

import { HEADER_BYTES, WIRE_VERSION, ADDRESS_BYTES, FRAME_CHALLENGE } from './frame.ts'
import type { Kind } from './hub.ts'

/**
 * Право на адрес: адрес - первые 16 байт SHA-256 открытого ключа подписи (ECDSA P-256), и
 * занять его может только тот, кто подпишет вызов релея этим ключом. Иначе любой, кто знает
 * адрес IDE (он в QR пары), вытеснил бы её и забрал её ящик. Порядок и формат - в
 * packages/remote-protocol (relay-claim.ts); здесь своя копия, как и у конверта, а тест сверяет
 * её с протоколом.
 *
 * Это разговор релея со стороной, а не чтение чужого: тела запечатанных кадров релей не
 * открывает и теперь.
 */

export const CHALLENGE_BYTES = 32

export const CLAIM_LABEL = 'aw/v1/relay-claim'

const SPKI_BYTES = 91

const SIGNATURE_BYTES = 64

/** Подпись не сошлась или ключ не тот. */
export const CLOSE_UNPROVEN = 4003

/** Ответа на вызов не было вовремя. */
export const CLOSE_PROOF_LATE = 4004

/** Адрес держит соединение другого вида. */
export const CLOSE_WRONG_KIND = 4005

export const newChallenge = (): Buffer => randomBytes(CHALLENGE_BYTES)

/** Вызов стороне: кому - заявленный адрес, от кого - нули, тело - случайные байты. */
export const challengeFrame = (address: Buffer, challenge: Buffer): Buffer => {
  const frame = Buffer.alloc(HEADER_BYTES + challenge.length)

  frame.writeUInt8(WIRE_VERSION, 0)
  frame.writeUInt8(FRAME_CHALLENGE, 1)
  address.copy(frame, 2)
  challenge.copy(frame, HEADER_BYTES)

  return frame
}

/** Подписанный текст: метка, вид входа, адрес и вызов base64url - поля через нулевой байт. */
export const claimInput = (kind: Kind, address: Buffer, challenge: Buffer): Buffer =>
  Buffer.concat(
    [CLAIM_LABEL, kind, address.toString('base64url'), challenge.toString('base64url')].flatMap(
      (part) => [Buffer.from(part, 'utf8'), Buffer.alloc(1)],
    ),
  )

/**
 * Ответ на вызов верен: ключ - P-256, его хеш начинается с адреса, подпись над текстом этого
 * входа и этого вызова. Любая ошибка разбора - просто «нет».
 */
export const proofHolds = (
  kind: Kind,
  address: Buffer,
  challenge: Buffer,
  body: Buffer,
): boolean => {
  if (body.length !== SPKI_BYTES + SIGNATURE_BYTES) return false

  const spki = body.subarray(0, SPKI_BYTES)
  const signature = body.subarray(SPKI_BYTES)
  const owner = createHash('sha256').update(spki).digest().subarray(0, ADDRESS_BYTES)

  if (!owner.equals(address)) return false

  try {
    const key = createPublicKey({ key: spki, format: 'der', type: 'spki' })

    if (key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return false

    return verify(
      'sha256',
      claimInput(kind, address, challenge),
      { key, dsaEncoding: 'ieee-p1363' },
      signature,
    )
  } catch {
    return false
  }
}
