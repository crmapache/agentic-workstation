import type { ServerResponse, IncomingMessage } from 'node:http'
import { createServer } from 'node:http'

import { SignatureDesk } from './auth.ts'
import { clientIp } from './callers.ts'
import { Catalog } from './catalog.ts'
import type { Config } from './config.ts'
import { STORE_VERSION } from './config.ts'
import { openDatabase } from './db.ts'
import { Ledger } from './ledger.ts'
import { RateLimit } from './rate-limit.ts'
import type { StoreRequest, StoreResponse } from './routes.ts'
import { createRoutes } from './routes.ts'

/**
 * Магазин расширений Agentic Workstation (ADR 0091): каталог, пакеты версий, публикация,
 * установки, оценки и отзывы. Держит только то, что ему отдали публиковать, и ключи IDE, которыми
 * подписаны записи; ни почты, ни паролей, ни кода IDE.
 */
export type Store = {
  /** Слушать порт и ответить, какой занят на деле: 0 - любой свободный (тесты). */
  listen: (port: number) => Promise<number>
  close: () => Promise<void>
}

const BASE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
}

class TooLarge extends Error {}

const readBody = (request: IncomingMessage, limit: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0

    request.on('data', (chunk: Buffer) => {
      size += chunk.length

      if (size > limit) {
        request.destroy()
        reject(new TooLarge())

        return
      }

      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })

const send = (response: ServerResponse, reply: StoreResponse) => {
  const body = reply.text ?? JSON.stringify(reply.json ?? null)

  response.writeHead(reply.status, {
    ...BASE_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    ...reply.headers,
  })
  response.end(body)
}

export const createStore = (
  config: Config,
  log: (line: string) => void,
  now: () => number = Date.now,
): Store => {
  const db = openDatabase(config.dataDir)
  const reads = new RateLimit(config.readsPerMinute, 60_000, now)
  const writes = new RateLimit(config.writesPerMinute, 60_000, now)
  const publishes = new RateLimit(config.publishesPerHour, 3_600_000, now)
  const route = createRoutes({
    catalog: new Catalog(db),
    ledger: new Ledger(db, now),
    signatures: new SignatureDesk(now),
    adminToken: config.adminToken,
    mayPublish: (key) => publishes.take(key),
  })

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://store.local')
    const method = request.method ?? 'GET'

    if (url.pathname === '/healthz') return send(response, { status: 200, json: { ok: true } })
    if (url.pathname === '/v1/info')
      return send(response, { status: 200, json: { version: STORE_VERSION } })

    const ip = clientIp(request, config.trustProxy)
    const limit = method === 'GET' ? reads : writes

    if (!limit.take(ip)) {
      return send(response, {
        status: 429,
        json: { error: 'rate-limited', message: 'Too many requests, try later.' },
      })
    }

    let body: Buffer

    try {
      body = await readBody(request, config.maxBodyBytes)
    } catch (error) {
      if (error instanceof TooLarge) {
        return send(response, {
          status: 413,
          json: { error: 'too-large', message: 'The request is too large.' },
        })
      }

      throw error
    }

    const storeRequest: StoreRequest = {
      method,
      url: `${url.pathname}${url.search}`,
      path: url.pathname,
      query: url.searchParams,
      headers: request.headers,
      body,
    }

    send(response, route(storeRequest))
  }

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      log(`ошибка запроса: ${error instanceof Error ? error.stack : String(error)}`)

      if (!response.headersSent)
        send(response, { status: 500, json: { error: 'server', message: 'Server error.' } })
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
        server.closeAllConnections()
        server.close(() => {
          db.close()
          resolve()
        })
      }),
  }
}
