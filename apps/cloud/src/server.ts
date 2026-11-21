import type { ServerResponse, IncomingMessage } from 'node:http'
import { createServer } from 'node:http'

import type { CloudInfo } from '@agentic-workstation/cloud-protocol/api'

import { SignatureDesk } from './auth.ts'
import { clientIp } from './callers.ts'
import type { Config } from './config.ts'
import { openDatabase } from './db.ts'
import { RateLimit } from './rate-limit.ts'
import { Records } from './records.ts'
import type { CloudResponse } from './routes.ts'
import { failure, createRoutes } from './routes.ts'
import { Waiters } from './waiters.ts'

/**
 * Облако Agentic Workstation (ADR 0102): хранит записи аккаунта шифром и раздаёт их IDE на всех
 * компьютерах с тем же ключом аккаунта. Ключа шифра у сервера нет: он видит открытый ключ
 * подписи, случайные id и непрозрачные blob - ни имён, ни почты, ни текста карточек.
 */
export type Cloud = {
  /** Слушать порт и ответить, какой занят на деле: 0 - любой свободный (тесты). */
  listen: (port: number) => Promise<number>
  close: () => Promise<void>
}

const BASE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
}

/**
 * Сверх предела тело дочитывается вхолостую ещё на столько: клиент, чуть перебравший, получает
 * внятный отказ 413, а не обрыв посреди отправки. Совсем большое тело - обрыв сразу.
 */
const DRAIN_BYTES = 1024 * 1024

class TooLarge extends Error {}

const readBody = (request: IncomingMessage, limit: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    let chunks: Buffer[] = []
    let size = 0

    request.on('data', (chunk: Buffer) => {
      size += chunk.length

      if (size > limit + DRAIN_BYTES) {
        request.destroy()
        reject(new TooLarge())

        return
      }

      if (size > limit) chunks = []
      else chunks.push(chunk)
    })
    request.on('end', () => {
      if (size > limit) reject(new TooLarge())
      else resolve(Buffer.concat(chunks))
    })
    request.on('error', reject)
  })

const send = (response: ServerResponse, reply: CloudResponse) => {
  // Соединения уже нет (клиент ушёл, тело оборвано) - писать некуда.
  if (response.writableEnded || !response.socket || response.socket.destroyed) return

  response.writeHead(reply.status, {
    ...BASE_HEADERS,
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(reply.json))
}

export const createCloud = (
  config: Config,
  log: (line: string) => void,
  now: () => number = Date.now,
): Cloud => {
  const db = openDatabase(config.dataDir)
  const reads = new RateLimit(config.readsPerMinute, 60_000, now)
  const writes = new RateLimit(config.writesPerMinute, 60_000, now)
  const accounts = new RateLimit(config.accountRequestsPerMinute, 60_000, now)
  const route = createRoutes({
    records: new Records(db, { maxAccountRecords: config.maxAccountRecords }, now),
    signatures: new SignatureDesk(now),
    waiters: new Waiters({ perAccount: config.maxWaitsPerAccount, total: config.maxWaits }),
    mayCall: (key) => accounts.take(key),
    log,
  })
  const info: CloudInfo & { build: string } = {
    service: 'agentic-workstation-cloud',
    protocol: 1,
    build: config.build,
  }
  // Отмена каждого открытого запроса: при остановке сервера ждущие заборы отпускаются сразу и
  // не трогают уже закрытую базу.
  const open = new Set<AbortController>()

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://cloud.local')
    const method = request.method ?? 'GET'

    if (url.pathname === '/healthz') return send(response, { status: 200, json: { ok: true } })
    if (url.pathname === '/v1/info') return send(response, { status: 200, json: info })

    const limit = method === 'GET' ? reads : writes

    if (!limit.take(clientIp(request, config.trustProxy)))
      return send(response, failure('rate-limited', 'Too many requests, try later.'))

    // 'close' у ответа - и конец ответа, и уход клиента; у запроса он приходит уже после
    // чтения тела, поэтому уход клиента посреди ожидания видит только ответ.
    const gone = new AbortController()

    open.add(gone)
    response.on('close', () => {
      gone.abort()
      open.delete(gone)
    })

    let body: Buffer

    try {
      body = await readBody(request, config.maxBodyBytes)
    } catch (error) {
      if (error instanceof TooLarge)
        return send(
          response,
          failure('too-large', `The body is over ${config.maxBodyBytes} bytes.`),
        )
      // Клиент оборвал отправку тела - это не ошибка сервера.
      if (gone.signal.aborted || request.destroyed) return

      throw error
    }

    const reply = await route({
      method,
      url: request.url ?? '/',
      path: url.pathname,
      query: url.searchParams,
      headers: request.headers,
      body,
      signal: gone.signal,
    })

    if (reply) send(response, reply)
  }

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      log(`ошибка запроса: ${error instanceof Error ? error.stack : String(error)}`)

      if (!response.headersSent) send(response, failure('server', 'Server error.'))
      else response.end()
    })
  })

  return {
    listen: (port) =>
      new Promise((resolve) => {
        server.listen(port, () => {
          const address = server.address()

          resolve(typeof address === 'object' && address ? address.port : port)
        })
      }),
    close: () =>
      new Promise((resolve) => {
        for (const request of open) request.abort()

        open.clear()
        server.closeAllConnections()
        server.close(() => {
          db.close()
          resolve()
        })
      }),
  }
}
