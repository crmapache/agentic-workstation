/**
 * Кадры native messaging Chrome: 4 байта длины в порядке байтов машины (на Mac - little
 * endian), за ними JSON в UTF-8. На Uint8Array, а не Buffer: модуль общий и для Node, и для
 * тестов без Node.
 */

/** Chrome шлёт host не больше 64 МБ за раз - больше в кадре прийти не может, только мусор. */
export const MAX_INBOUND_FRAME_BYTES = 64 * 1024 * 1024

const HEADER = 4

/** Кадр не разобрать: длина больше предела или внутри не JSON. Поток после этого не спасти. */
export class FrameError extends Error {}

export const encodeFrame = (message: unknown): Uint8Array =>
  encodeFrameJson(JSON.stringify(message))

/** Кадр из готовой строки JSON: host пересылает строку сокета, не разбирая её заново. */
export const encodeFrameJson = (json: string): Uint8Array => {
  const body = new TextEncoder().encode(json)
  const frame = new Uint8Array(HEADER + body.length)

  new DataView(frame.buffer).setUint32(0, body.length, true)
  frame.set(body, HEADER)

  return frame
}

/**
 * Сборщик кадров из кусков потока: stdin отдаёт байты как придётся - полкадра, два кадра
 * разом, заголовок по частям. Линейный: тело кадра выделяется один раз по длине из
 * заголовка и заполняется кусками на месте - без склейки всего накопленного на каждом куске
 * (картинка в десятки мегабайт приходит тысячами кусков по 64 КБ).
 */
export class FrameDecoder {
  private readonly header = new Uint8Array(HEADER)
  private headerFilled = 0
  private body: Uint8Array | null = null
  private bodyFilled = 0

  constructor(private readonly maxBytes = MAX_INBOUND_FRAME_BYTES) {}

  push(chunk: Uint8Array): unknown[] {
    const messages: unknown[] = []
    let offset = 0

    while (offset < chunk.length) {
      if (!this.body) {
        const take = Math.min(HEADER - this.headerFilled, chunk.length - offset)

        this.header.set(chunk.subarray(offset, offset + take), this.headerFilled)
        this.headerFilled += take
        offset += take

        if (this.headerFilled < HEADER) break

        const length = new DataView(this.header.buffer).getUint32(0, true)

        if (length > this.maxBytes) throw new FrameError(`Frame of ${length} bytes is too large`)

        this.headerFilled = 0
        this.body = new Uint8Array(length)
        this.bodyFilled = 0
      }

      const take = Math.min(this.body.length - this.bodyFilled, chunk.length - offset)

      this.body.set(chunk.subarray(offset, offset + take), this.bodyFilled)
      this.bodyFilled += take
      offset += take

      if (this.bodyFilled === this.body.length) {
        const body = this.body

        this.body = null
        messages.push(decodeBody(body))
      }
    }

    return messages
  }
}

const decodeBody = (body: Uint8Array): unknown => {
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown
  } catch {
    throw new FrameError('Frame is not JSON')
  }
}
