import { toBase64Url, fromBase64Url } from './base64'

/**
 * Конверт релея: 42 байта открытого заголовка и тело, которого релей не читает. Это всё, что
 * релей знает о кадре: два непрозрачных адреса по 16 байт, вид и счётчик. Раскладка:
 *
 * | байт  | что                                              |
 * | ----- | ------------------------------------------------ |
 * | 0     | версия провода (1)                               |
 * | 1     | вид кадра (FRAME_*)                              |
 * | 2-17  | кому (адрес 16 байт)                             |
 * | 18-33 | от кого (адрес 16 байт)                          |
 * | 34-41 | счётчик u64 big-endian (часть nonce AES-GCM)     |
 *
 * Тот же заголовок целиком - дополнительные данные печати: релей не переадресует кадр и не
 * перевесит на него другой вид, не сломав тег.
 */

export const WIRE_VERSION = 1

export const HEADER_BYTES = 42

export const ADDRESS_BYTES = 16

/** Потолок кадра у релея и у обеих сторон: переросший релей не режет, а закрывает сокет. */
export const MAX_FRAME_BYTES = 256 * 1024

/** Тег AES-GCM в конце запечатанного тела. */
export const SEAL_TAG_BYTES = 16

/** Сколько открытого тела влезает в один запечатанный кадр. */
export const MAX_BODY_BYTES = MAX_FRAME_BYTES - HEADER_BYTES - SEAL_TAG_BYTES

export const FRAME_SEALED = 0x01

/** Слово самого релея, и только одно: «был обрыв, переспроси». Никогда не содержимое. */
export const FRAME_CONTROL = 0x02

/**
 * «Разбуди устройство», только IDE → релей: тело - подписка телефона и payload, запечатанный
 * для него (push.ts). Релей отдаёт payload службе пушей и дальше кадр никому не пересылает.
 */
export const FRAME_PUSH = 0x03

/**
 * Вызов релея сразу после открытия сокета: «докажи, что адрес твой» (relay-claim.ts). Кому -
 * заявленный адрес, от кого - нули, тело - случайные байты вызова.
 */
export const FRAME_CHALLENGE = 0x04

/** Ответ на вызов: открытый ключ подписи и подпись вызова. Релей его не пересылает никому. */
export const FRAME_PROOF = 0x05

/**
 * Слово релея IDE после пуша: служба пушей ответила, что подписки этого телефона больше нет
 * (404 или 410), или адрес службы не из белого списка релея. Кому - IDE, от кого - телефон,
 * тела нет. IDE забывает подписку: дальше будить его нечем, пока он не пришлёт новую.
 */
export const FRAME_PUSH_GONE = 0x06

export type FrameType =
  | typeof FRAME_SEALED
  | typeof FRAME_CONTROL
  | typeof FRAME_PUSH
  | typeof FRAME_CHALLENGE
  | typeof FRAME_PROOF
  | typeof FRAME_PUSH_GONE

const TYPES: readonly number[] = [
  FRAME_SEALED,
  FRAME_CONTROL,
  FRAME_PUSH,
  FRAME_CHALLENGE,
  FRAME_PROOF,
  FRAME_PUSH_GONE,
]

export type Frame = {
  version: number
  type: FrameType
  to: Uint8Array
  from: Uint8Array
  counter: bigint
  body: Uint8Array
}

/** Кадр не читается: короче заголовка, больше потолка, чужая версия или вид, кривой адрес. */
export class FrameError extends Error {}

const U64_MAX = (1n << 64n) - 1n

/** Заголовок без тела - он же дополнительные данные печати. */
export const encodeHeader = (
  type: FrameType,
  to: Uint8Array,
  from: Uint8Array,
  counter: bigint,
): Uint8Array => encodeFrame(type, to, from, counter, new Uint8Array(0))

export const encodeFrame = (
  type: FrameType,
  to: Uint8Array,
  from: Uint8Array,
  counter: bigint,
  body: Uint8Array,
): Uint8Array => {
  if (to.length !== ADDRESS_BYTES || from.length !== ADDRESS_BYTES) {
    throw new FrameError('an address is exactly 16 bytes')
  }

  if (counter < 0n || counter > U64_MAX) throw new FrameError('a counter is an unsigned 64-bit')

  const frame = new Uint8Array(HEADER_BYTES + body.length)
  const view = new DataView(frame.buffer)

  view.setUint8(0, WIRE_VERSION)
  view.setUint8(1, type)
  frame.set(to, 2)
  frame.set(from, 18)
  view.setBigUint64(34, counter, false)
  frame.set(body, HEADER_BYTES)

  return frame
}

/** Разобрать кадр. Части - копии, а не окна в принятый буфер: кадр живёт дольше сокета. */
export const decodeFrame = (raw: Uint8Array, maxBytes: number = MAX_FRAME_BYTES): Frame => {
  if (raw.length < HEADER_BYTES) throw new FrameError('frame shorter than its header')
  if (raw.length > maxBytes) throw new FrameError('frame over the size limit')

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const version = view.getUint8(0)

  if (version !== WIRE_VERSION) throw new FrameError(`unknown wire version ${version}`)

  const type = view.getUint8(1)

  if (!TYPES.includes(type)) throw new FrameError(`unknown frame type ${type}`)

  return {
    version,
    type: type as FrameType,
    to: raw.slice(2, 18),
    from: raw.slice(18, 34),
    counter: view.getBigUint64(34, false),
    body: raw.slice(HEADER_BYTES),
  }
}

/** Адрес в URL и в списках: 16 байт как 22 знака base64url. */
export const encodeAddress = (address: Uint8Array): string => {
  if (address.length !== ADDRESS_BYTES) throw new FrameError('an address is exactly 16 bytes')

  return toBase64Url(address)
}

export const ADDRESS_PATTERN = /^[A-Za-z0-9_-]{22}$/

export const decodeAddress = (text: string): Uint8Array => {
  const bytes = ADDRESS_PATTERN.test(text) ? fromBase64Url(text) : null

  if (!bytes || bytes.length !== ADDRESS_BYTES) throw new FrameError('not an address')

  return bytes
}

export const isAddress = (text: unknown): text is string =>
  typeof text === 'string' && ADDRESS_PATTERN.test(text)

export const sameBytes = (first: Uint8Array, second: Uint8Array): boolean =>
  first.length === second.length && first.every((byte, index) => byte === second[index])
