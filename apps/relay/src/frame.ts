/**
 * Конверт - единственная часть кадра, которую релей читает: 42 байта заголовка по
 * постоянным смещениям. Тело релей не разбирает, не декодирует и не пишет в журнал - здесь
 * нет кода, который мог бы это сделать. Раскладка та же, что в packages/remote-protocol
 * (frame.ts): версия, вид, кому, от кого, счётчик. Своя копия намеренно: релей проверяется
 * чтением одной папки, а тест сверяет его с протоколом.
 */

export const HEADER_BYTES = 42

export const WIRE_VERSION = 1

export const ADDRESS_BYTES = 16

export const FRAME_SEALED = 0x01

/** Слово самого релея: «был обрыв, переспроси». Единственное, что он говорит сам. */
export const FRAME_CONTROL = 0x02

/**
 * «Разбуди устройство» - только от IDE: тело - подписка телефона и запечатанный для него
 * payload (push-frame.ts). Релей отдаёт payload службе пушей и дальше кадр не пересылает.
 */
export const FRAME_PUSH = 0x03

/** Вызов релея «докажи, что адрес твой» (claim.ts) - только от релея стороне. */
export const FRAME_CHALLENGE = 0x04

/** Ответ стороны на вызов: ключ подписи и подпись. Никуда не пересылается. */
export const FRAME_PROOF = 0x05

/** Слово релея IDE после пуша: подписки телефона больше нет. Только от релея стороне. */
export const FRAME_PUSH_GONE = 0x06

export type Envelope = { type: number; to: Buffer; from: Buffer }

export class FrameError extends Error {}

/** Заголовок кадра. Части - окна в принятый буфер: кадр уходит дальше теми же байтами. */
export const readEnvelope = (raw: Buffer, maxBytes: number): Envelope => {
  if (raw.length < HEADER_BYTES) throw new FrameError('frame shorter than its header')
  if (raw.length > maxBytes) throw new FrameError('frame over the size limit')

  const version = raw.readUInt8(0)

  if (version !== WIRE_VERSION) throw new FrameError(`unknown wire version ${version}`)

  const type = raw.readUInt8(1)

  // Вызов и «подписки нет» шлёт только релей: от стороны такой кадр - не на языке релея.
  if (![FRAME_SEALED, FRAME_CONTROL, FRAME_PUSH, FRAME_PROOF].includes(type)) {
    throw new FrameError(`unknown frame type ${type}`)
  }

  return { type, to: raw.subarray(2, 18), from: raw.subarray(18, 34) }
}

/** Слово релея адресату: без тела, счётчик 0, «от» - тот, чьи кадры пропали. */
export const controlFrame = (to: Buffer, from: Buffer): Buffer => {
  const frame = Buffer.alloc(HEADER_BYTES)

  frame.writeUInt8(WIRE_VERSION, 0)
  frame.writeUInt8(FRAME_CONTROL, 1)
  to.copy(frame, 2)
  from.copy(frame, 18)

  return frame
}

/**
 * Адрес в URL: 16 байт как 22 знака base64url - начало SHA-256 ключа подписи стороны (claim.ts).
 * Ни о человеке, ни о машине.
 */
export const decodeAddress = (text: string): Buffer => {
  const bytes = /^[A-Za-z0-9_-]{22}$/.test(text) ? Buffer.from(text, 'base64url') : null

  if (!bytes || bytes.length !== ADDRESS_BYTES) throw new FrameError('not an address')

  return bytes
}

export const encodeAddress = (address: Buffer): string => address.toString('base64url')

/** Первые четыре байта адреса - для строки журнала. Никогда весь адрес и никогда тело. */
export const addressHint = (address: Buffer): string => address.subarray(0, 4).toString('hex')
