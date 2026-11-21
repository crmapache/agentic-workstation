import { statfsSync } from 'node:fs'
import type { ServerResponse, IncomingMessage } from 'node:http'
import { createServer } from 'node:http'

import type { CloudInfo } from '@agentic-workstation/cloud-protocol/api'

import { SignatureDesk } from './auth.ts'
import { readBody, TooLarge, BodyBudget, declaredBody } from './body.ts'
import { clientIp, ANONYMOUS } from './callers.ts'
import type { Config } from './config.ts'
import { openDatabase } from './db.ts'
import type { Take } from './rate-limit.ts'
import { RateLimit } from './rate-limit.ts'
import { Records } from './records.ts'
import type { CloudResponse } from './replies.ts'
import { busy, failure } from './replies.ts'
import { createRoutes } from './routes.ts'
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

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/**
 * Отказ до чтения тела оставляет тело в соединении, и Node выбрасывает его сам после ответа.
 * Тело чуть сверх предела так и выбрасывается: клиент дочитывает внятный ответ, а не обрыв
 * посреди отправки. Тело без длины или больше предела ещё на столько - соединение закрывается
 * сразу после ответа, гонять мегабайты вхолостую незачем.
 */
const DRAIN_BYTES = 1024 * 1024

const send = (response: ServerResponse, reply: CloudResponse, close = false) => {
  // Соединения уже нет (клиент ушёл, тело оборвано) - писать некуда.
  if (response.writableEnded || !response.socket || response.socket.destroyed) return

  response.writeHead(reply.status, {
    ...BASE_HEADERS,
    ...reply.headers,
    'content-type': 'application/json; charset=utf-8',
    ...(close ? { connection: 'close' } : {}),
  })
  response.end(JSON.stringify(reply.json))
}

/** Свободное место на диске папки данных - то, что доступно процессу без root. */
const freeDiskBytes = (dir: string): number => {
  const stats = statfsSync(dir)

  return stats.bavail * stats.bsize
}

export const createCloud = (
  config: Config,
  log: (line: string) => void,
  now: () => number = Date.now,
): Cloud => {
  const db = openDatabase(config.dataDir)
  const limiter = (limit: number, windowMs: number) =>
    new RateLimit({ limit, windowMs, maxKeys: config.maxTrackedKeys, now })
  const reads = limiter(config.readsPerMinute, MINUTE)
  const writes = limiter(config.writesPerMinute, MINUTE)
  const accounts = limiter(config.accountRequestsPerMinute, MINUTE)
  const newAccounts = limiter(config.newAccountsPerDay, DAY)
  // Пределы «на адрес» к анонимному не применяются (callers.ts): его держат пределы на аккаунт
  // и общие потолки.
  const perCaller = (limit: RateLimit, caller: string): Take =>
    caller === ANONYMOUS ? 'ok' : limit.take(caller)
  const budget = new BodyBudget(config.maxBodyMemoryBytes)
  const admit = createRoutes({
    records: new Records(db, config, now),
    signatures: new SignatureDesk({ maxNonces: config.maxNonces }, now),
    waiters: new Waiters({
      perAccount: config.maxWaitsPerAccount,
      perCaller: config.maxWaitsPerCaller,
      total: config.maxWaits,
    }),
    maxBodyBytes: config.maxBodyBytes,
    fromCaller: (caller, method) => perCaller(method === 'GET' ? reads : writes, caller),
    forAccount: (key) => accounts.take(key),
    newAccount: (caller) => perCaller(newAccounts, caller),
    hasRoom: () => freeDiskBytes(config.dataDir) >= config.minFreeDiskBytes,
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

    // 'close' у ответа - и конец ответа, и уход клиента; у запроса он приходит уже после
    // чтения тела, поэтому уход клиента посреди ожидания видит только ответ.
    const gone = new AbortController()

    open.add(gone)
    response.on('close', () => {
      gone.abort()
      open.delete(gone)
    })

    const declared = declaredBody(request.headers)
    const unread = declared === 'unknown' || declared > config.maxBodyBytes + DRAIN_BYTES
    const admission = admit({
      method,
      url: request.url ?? '/',
      path: url.pathname,
      query: url.searchParams,
      host: request.headers.host ?? '',
      headers: request.headers,
      caller: clientIp(request, request.socket.remoteAddress, config.trustProxy),
      body: declared,
      signal: gone.signal,
    })

    if (admission.kind === 'refuse') return send(response, admission.reply, unread)
    if (!budget.reserve(admission.reserve)) return send(response, busy(), unread)

    // Место под тело занято до конца обработки: тело в памяти, пока запись не легла в базу.
    try {
      let body: Buffer

      try {
        body = await readBody(request, config.maxBodyBytes)
      } catch (error) {
        if (error instanceof TooLarge)
          return send(
            response,
            failure('too-large', `The body is over ${config.maxBodyBytes} bytes.`),
            true,
          )
        // Клиент оборвал отправку тела или не успел за requestTimeout - не ошибка сервера.
        if (gone.signal.aborted || request.destroyed) return

        throw error
      }

      const reply = await admission.run(body)

      if (reply) send(response, reply)
    } finally {
      budget.release(admission.reserve)
    }
  }

  const server = createServer(
    {
      headersTimeout: config.headersTimeoutMs,
      requestTimeout: config.requestTimeoutMs,
      // Сроки Node сверяет обходом соединений раз в этот промежуток. По умолчанию - 30 секунд,
      // и срок заголовков в 10 секунд на деле растягивался бы до 40.
      connectionsCheckingInterval: Math.min(1000, config.headersTimeoutMs / 5),
    },
    (request, response) => {
      handle(request, response).catch((error: unknown) => {
        log(`ошибка запроса: ${error instanceof Error ? error.stack : String(error)}`)

        if (!response.headersSent) send(response, failure('server', 'Server error.'))
        else response.end()
      })
    },
  )

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

        for (const limit of [reads, writes, accounts, newAccounts]) limit.dispose()

        open.clear()
        server.closeAllConnections()
        server.close(() => {
          db.close()
          resolve()
        })
      }),
  }
}
