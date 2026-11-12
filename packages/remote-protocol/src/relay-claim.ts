import { toBase64Url } from './base64'
import { macInput } from './crypto-spec'
import { ADDRESS_BYTES } from './frame'

/**
 * Право на адрес у релея. Адрес - не случайные байты, а первые 16 байт SHA-256 от открытого
 * ключа подписи (ECDSA P-256, SPKI): им владеет тот, у кого закрытый ключ. Иначе любой, кто
 * знает адрес IDE (он в QR пары), занял бы его, вытеснил IDE и забрал её ящик.
 *
 * Порядок на каждом соединении:
 *
 * 1. Сторона открывает `/v1/agent?id=<адрес>` или `/v1/device?id=<адрес>`.
 * 2. Релей шлёт кадр FRAME_CHALLENGE: кому - этот адрес, от кого - нули, тело - 32 случайных
 *    байта.
 * 3. Сторона отвечает кадром FRAME_PROOF: от кого - свой адрес, тело - SPKI ключа подписи (91
 *    байт) и подпись (64 байта, r‖s, как отдаёт WebCrypto) над claimInput.
 * 4. Релей сверяет: SHA-256(SPKI) начинается с адреса, подпись верна. Только тогда адрес занят
 *    (вытеснение прежнего, ящик, маршрут). Нет ответа вовремя - закрытие CLOSE_PROOF_LATE,
 *    ответ неверный - CLOSE_UNPROVEN.
 *
 * Вид соединения (agent или device) - внутри подписанного текста: подпись, сделанная для
 * одного входа, на другом не годится. И адрес, занятый одним видом, другой вид не вытесняет
 * (CLOSE_WRONG_KIND). Тела запечатанных кадров релей по-прежнему не читает: доказательство -
 * его собственный разговор со стороной, а не чужое содержимое.
 */

export type ClaimKind = 'agent' | 'device'

export const CLAIM_LABEL = 'aw/v1/relay-claim'

export const CHALLENGE_BYTES = 32

/** SPKI открытого ключа P-256 без сжатия - всегда 91 байт. */
export const SIGNING_SPKI_BYTES = 91

/** Подпись ECDSA P-256 в виде r‖s (IEEE P1363) - 64 байта. */
export const SIGNATURE_BYTES = 64

export const PROOF_BYTES = SIGNING_SPKI_BYTES + SIGNATURE_BYTES

/** Сколько релей ждёт ответа на вызов. */
export const CLAIM_PATIENCE_MS = 10_000

/** Подпись не сошлась или ключ не тот: повтор ничего не изменит. */
export const CLOSE_UNPROVEN = 4003

/** Ответа на вызов не было вовремя: сеть медленная, звонить снова можно. */
export const CLOSE_PROOF_LATE = 4004

/** Адрес сейчас держит соединение другого вида (agent против device). */
export const CLOSE_WRONG_KIND = 4005

/** Что подписывается: метка, вид входа, адрес и вызов - поля через нулевой байт. */
export const claimInput = (kind: ClaimKind, address: string, challenge: Uint8Array): Uint8Array =>
  macInput([CLAIM_LABEL, kind, address, toBase64Url(challenge)])

/** Адрес по SHA-256 открытого ключа подписи: хеш считает сторона своим средством. */
export const addressOfKeyHash = (sha256OfSpki: Uint8Array): Uint8Array =>
  sha256OfSpki.slice(0, ADDRESS_BYTES)

/** Тело ответа на вызов: ключ и подпись подряд. */
export const proofBody = (spki: Uint8Array, signature: Uint8Array): Uint8Array => {
  if (spki.length !== SIGNING_SPKI_BYTES || signature.length !== SIGNATURE_BYTES) {
    throw new Error('a proof is a P-256 SPKI and a 64-byte signature')
  }

  const body = new Uint8Array(PROOF_BYTES)

  body.set(spki, 0)
  body.set(signature, SIGNING_SPKI_BYTES)

  return body
}

/** Ключ и подпись из тела ответа; длина не та - null. */
export const readProofBody = (
  body: Uint8Array,
): { spki: Uint8Array; signature: Uint8Array } | null =>
  body.length === PROOF_BYTES
    ? { spki: body.slice(0, SIGNING_SPKI_BYTES), signature: body.slice(SIGNING_SPKI_BYTES) }
    : null
