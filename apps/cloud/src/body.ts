import type { IncomingMessage, IncomingHttpHeaders } from 'node:http'

/**
 * Сколько тела обещают заголовки: число байт (0 - тела нет) или 'unknown' - тело кусками без
 * длины (chunked). Длину Node уже проверил: два разных Content-Length или мусор в нём - 400 до
 * нас, а тело ровно такой длины, как сказано.
 */
export const declaredBody = (headers: IncomingHttpHeaders): number | 'unknown' => {
  if (headers['transfer-encoding'] !== undefined) return 'unknown'

  const length = Number(headers['content-length'] ?? 0)

  return Number.isSafeInteger(length) && length >= 0 ? length : 'unknown'
}

/**
 * Тела запросов в памяти разом. Каждый запрос с телом сначала занимает место (заявленную длину
 * или потолок, если длины нет) и только потом читает: сотня медленных отправок по 4 МиБ иначе
 * держала бы в памяти сотни мегабайт. Место не занять - запрос получает 503 до чтения.
 */
export class BodyBudget {
  private held = 0
  private readonly cap: number

  constructor(cap: number) {
    this.cap = cap
  }

  /** Занять bytes; false - места нет. Ноль занимается всегда. */
  reserve(bytes: number): boolean {
    if (bytes === 0) return true
    if (this.held + bytes > this.cap) return false

    this.held += bytes

    return true
  }

  release(bytes: number): void {
    this.held = Math.max(0, this.held - bytes)
  }
}

export class TooLarge extends Error {}

/**
 * Прочитать тело не длиннее limit. Сверх предела (бывает только у тела без длины: заявленную
 * длину сервер сверил до чтения) куски дальше не копятся - отказ сразу, остаток выбросит Node
 * вместе с закрытием соединения. Клиент ушёл посреди отправки - отказ, а не вечное ожидание.
 */
export const readBody = (request: IncomingMessage, limit: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const settle = (error: Error | null) => {
      if (settled) return

      settled = true
      if (error) reject(error)
      else resolve(Buffer.concat(chunks))
    }

    request.on('data', (chunk: Buffer) => {
      if (settled) return

      size += chunk.length

      if (size > limit) {
        chunks.length = 0
        settle(new TooLarge())

        return
      }

      chunks.push(chunk)
    })
    request.on('end', () => settle(null))
    request.on('error', settle)
    request.on('close', () => {
      if (!request.complete) settle(new Error('the client left before the body ended'))
    })
  })
