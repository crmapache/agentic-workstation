/**
 * Звук голосового звонка (ADR 0104) - двоичным телом внутри SEALED-кадра, рядом с JSON: тело
 * JSON всегда начинается с `{` (0x7b), тело звука - с вида кадра. Релей тел не читает, поэтому
 * звук идёт тем же шифром и тем же путём, что и всё остальное.
 *
 * Заголовок - 8 байт: вид (1), флаги (1, пока 0), эпоха ответа (uint16), номер кадра в эпохе
 * (uint32), дальше PCM16 моно: микрофон - 16 кГц кадрами по 80 мс, ответ - 24 кГц. Чтение
 * вслух ответа из ленты (ADR 0106) - тем же кадром своего вида, эпоха - номер чтения телефона.
 */

export const AUDIO_MIC = 0x01
export const AUDIO_ANSWER = 0x02
export const AUDIO_READING = 0x03

const KINDS = { [AUDIO_MIC]: 'mic', [AUDIO_ANSWER]: 'answer', [AUDIO_READING]: 'reading' } as const

const CODES = { mic: AUDIO_MIC, answer: AUDIO_ANSWER, reading: AUDIO_READING } as const

const HEADER_BYTES = 8

/** Тело звука тяжелее этого - не кадр звонка: 200 мс ответа 24 кГц - 9600 байт. */
export const MAX_AUDIO_BYTES = 32 * 1024

/**
 * Сколько кадров микрофона в минуту принимает IDE: 750 по 80 мс и запас на рывок после
 * переподключения.
 */
export const AUDIO_FRAMES_PER_MINUTE = 1200

export type AudioFrame = {
  kind: 'mic' | 'answer' | 'reading'
  /**
   * Эпоха ответа: перебили - новая, кадры прежней выкидываются (у микрофона всегда 0). У чтения
   * вслух - номер чтения: кадры прежнего чтения телефон не играет.
   */
  epoch: number
  frame: number
  pcm: Uint8Array
}

/** Звук ли это, а не JSON: по первому байту, без разбора. */
export const isAudioBody = (bytes: Uint8Array): boolean =>
  bytes.length >= HEADER_BYTES && (bytes[0] ?? 0) in KINDS

export const encodeAudio = ({ kind, epoch, frame, pcm }: AudioFrame): Uint8Array => {
  const body = new Uint8Array(HEADER_BYTES + pcm.byteLength)
  const view = new DataView(body.buffer)

  view.setUint8(0, CODES[kind])
  view.setUint8(1, 0)
  view.setUint16(2, epoch & 0xffff)
  view.setUint32(4, frame >>> 0)
  body.set(pcm, HEADER_BYTES)

  return body
}

/** Кадр звука из тела; не звук, тяжелее потолка или нечётное число байт PCM16 - null. */
export const decodeAudio = (bytes: Uint8Array): AudioFrame | null => {
  if (!isAudioBody(bytes) || bytes.length > MAX_AUDIO_BYTES) return null

  const pcm = bytes.subarray(HEADER_BYTES)

  if (pcm.byteLength % 2 !== 0) return null

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  return {
    kind: KINDS[bytes[0] as keyof typeof KINDS],
    epoch: view.getUint16(2),
    frame: view.getUint32(4),
    pcm,
  }
}
