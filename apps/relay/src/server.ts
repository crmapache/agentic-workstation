import type { ServerResponse, IncomingMessage } from 'node:http'
import { createServer } from 'node:http'
import type { Duplex } from 'node:stream'

import type { WebSocket } from 'ws'
import { WebSocketServer } from 'ws'

import { clientIp, ANONYMOUS, originAllowed } from './callers.ts'
import {
  proofHolds,
  newChallenge,
  challengeFrame,
  CLOSE_UNPROVEN,
  CLOSE_PROOF_LATE,
  CLOSE_WRONG_KIND,
} from './claim.ts'
import type { Config } from './config.ts'
import { RELAY_VERSION } from './config.ts'
import type { Envelope } from './frame.ts'
import {
  FRAME_PUSH,
  addressHint,
  FRAME_PROOF,
  HEADER_BYTES,
  readEnvelope,
  WIRE_VERSION,
  decodeAddress,
} from './frame.ts'
import { pageHeaders } from './headers.ts'
import type { Kind } from './hub.ts'
import { Hub, CLOSE_POLICY, CLOSE_BAD_ADDRESS, CLOSE_BAD_VERSION } from './hub.ts'
import { Mailboxes } from './mailbox.ts'
import { PRIVACY_PAGE } from './privacy.ts'
import { serveStatic } from './static-files.ts'

/**
 * Релей Remote Control Agentic Workstation: знакомит IDE с телефоном и передаёт между ними
 * запечатанные кадры. Видит он ровно это: два непрозрачных адреса по 16 байт, счётчик, размер
 * кадра и когда тот прошёл. Не видит ничего внутри: ни кода, ни файлов, ни команд, ни имён
 * проектов - не потому, что обещает не смотреть, а потому, что здесь нет кода, который мог бы.
 * На диск не пишет ничего: всё состояние - карта живых сокетов и короткий ящик для мигнувшей
 * стороны; перезапуск опустошает оба.
 */

export type Relay = {
  /** Слушать порт и ответить, какой занят на деле: 0 - любой свободный (тесты). */
  listen: (port: number) => Promise<number>
  close: () => Promise<void>
  /** Для тестов: сколько адресов на линии. */
  connections: () => number
}

const HEADERS = { 'x-content-type-options': 'nosniff' }

/** Релей поверх настроек. Создание отдельно от запуска: тест поднимает свой на свободном порту. */
export const createRelay = (config: Config, log: (line: string) => void): Relay => {
  const mailboxes = new Mailboxes({
    ttlMs: config.mailboxTtlMs,
    maxFrames: config.mailboxMaxFrames,
    maxBytes: config.mailboxMaxBytes,
    totalBytes: config.mailboxTotalBytes,
  })
  const hub = new Hub(mailboxes, log)

  const http = createServer((request: IncomingMessage, response: ServerResponse) => {
    const path = (request.url ?? '/').split('?')[0] ?? '/'

    if (path === '/healthz') {
      response.writeHead(200, { 'content-type': 'text/plain', ...HEADERS }).end('ok')

      return
    }

    if (path === '/v1/info') {
      response.writeHead(200, { 'content-type': 'application/json', ...HEADERS }).end(
        JSON.stringify({
          relayVersion: RELAY_VERSION,
          build: config.build,
          wireMin: WIRE_VERSION,
          wireMax: WIRE_VERSION,
          maxFrameBytes: config.maxFrameBytes,
          mailboxTtlSeconds: Math.round(config.mailboxTtlMs / 1000),
          push: false,
        }),
      )

      return
    }

    if (path === '/privacy' || path === '/privacy/') {
      response
        .writeHead(200, {
          ...pageHeaders(request.headers.host),
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-cache',
        })
        .end(PRIVACY_PAGE)

      return
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response
        .writeHead(405, { 'content-type': 'text/plain', ...HEADERS })
        .end('method not allowed')

      return
    }

    serveStatic(config.staticDir, path, response, pageHeaders(request.headers.host))
  })

  // Потолок - у самого транспорта: по умолчанию ws собирает сто мегабайт прежде, чем код
  // увидит сообщение. Переросший кадр закрывает сокет кодом 1009.
  const sockets = new WebSocketServer({ noServer: true, maxPayload: config.maxFrameBytes })
  const perCaller = new Map<string, number>()
  /** Ответил ли сокет на прошлый пинг - и чей это адрес, чтобы сказать хабу о потере. */
  const answered = new Map<WebSocket, { address: Buffer; alive: boolean }>()
  let live = 0

  http.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? '/', 'http://relay')
    const kind: Kind | null =
      url.pathname === '/v1/agent' ? 'agent' : url.pathname === '/v1/device' ? 'device' : null

    if (!kind) return void socket.destroy()

    // Сокет не подчиняется политике одного источника: без этого любая страница в чьём-то
    // браузере могла бы звонить сюда через него. IDE шлёт без Origin - она не браузер.
    if (!originAllowed(request, config.allowedOrigins)) {
      log('an upgrade came from an origin this relay does not serve - refused')

      return void socket.destroy()
    }

    const caller = clientIp(request, request.socket.remoteAddress, config.trustProxy)
    const held = perCaller.get(caller) ?? 0

    if (
      live >= config.maxConnections ||
      (caller !== ANONYMOUS && held >= config.maxConnectionsPerIp)
    ) {
      // Без адреса в строке: журнал, называющий отказанного, - журнал того, кто звонит.
      log('a caller is at its ceiling of open sockets - refused')

      return void socket.destroy()
    }

    live += 1
    perCaller.set(caller, held + 1)
    // На сыром сокете: у неудавшегося апгрейда нет WebSocket, и место держалось бы вечно.
    socket.once('close', () => {
      live -= 1

      const rest = (perCaller.get(caller) ?? 1) - 1

      if (rest <= 0) perCaller.delete(caller)
      else perCaller.set(caller, rest)
    })

    sockets.handleUpgrade(request, socket, head, (connection) =>
      accept(connection, kind, url.searchParams.get('id') ?? ''),
    )
  })

  /**
   * Новое соединение: сначала вызов «докажи, что адрес твой», и только верный ответ занимает
   * адрес (вытеснение, ящик, маршрут). До ответа соединение ничего не получает и ничего не
   * шлёт дальше: иначе знающий адрес IDE из QR занял бы его без ключа.
   */
  const accept = (connection: WebSocket, kind: Kind, id: string): void => {
    let address: Buffer

    try {
      address = decodeAddress(id)
    } catch {
      return connection.close(CLOSE_BAD_ADDRESS, 'the address in the url is not an address')
    }

    const challenge = newChallenge()
    let proven = false
    const late = setTimeout(() => {
      log(`${kind} ${addressHint(address)} did not prove its address in time - closing`)
      connection.close(CLOSE_PROOF_LATE, 'no proof of the address')
    }, config.claimPatienceMs)

    connection.send(challengeFrame(address, challenge))

    /** Ответ на вызов: верный - адрес занят; неверный или чужого вида - закрыть. */
    const claim = (envelope: Envelope, data: Buffer) => {
      clearTimeout(late)

      if (
        envelope.type !== FRAME_PROOF ||
        !envelope.from.equals(address) ||
        !proofHolds(kind, address, challenge, data.subarray(HEADER_BYTES))
      ) {
        log(`${kind} ${addressHint(address)} failed to prove its address - closing`)

        return connection.close(CLOSE_UNPROVEN, 'the proof of the address does not hold')
      }

      if (!hub.open(address, kind, connection, Date.now())) {
        log(`${addressHint(address)} is held by a connection of the other kind - closing`)

        return connection.close(CLOSE_WRONG_KIND, 'the address is held by the other kind')
      }

      proven = true
      answered.set(connection, { address, alive: true })
      log(`${kind} ${addressHint(address)} connected (${hub.count()} live)`)
    }

    connection.on('pong', () => {
      const entry = answered.get(connection)

      if (entry) entry.alive = true
    })

    let frames = 0
    const window = setInterval(() => {
      frames = 0
    }, 60_000)

    connection.on('message', (data: Buffer, isBinary: boolean) => {
      if (!isBinary) return connection.close(CLOSE_BAD_VERSION, 'frames are binary')

      frames += 1

      if (frames > config.rateFramesPerMinute) {
        log(`${addressHint(address)} is over its rate - closing`)

        return connection.close(CLOSE_POLICY, 'too many frames')
      }

      try {
        const envelope = readEnvelope(data, config.maxFrameBytes)

        if (!proven) return claim(envelope, data)

        // Ответ на вызов - разговор с релеем, а не кадр кому-то: второй раз ему незачем.
        if (envelope.type === FRAME_PROOF) return

        // Отправитель - тот адрес, которым соединение назвалось. Иначе устройство писало бы
        // IDE, с которой никогда не спаривалось, от чужого имени.
        if (!envelope.from.equals(address)) {
          return log(`${addressHint(address)} sent a frame from someone else - dropped`)
        }

        // Службы пушей пока нет: «разбуди» некому отдать, а держать его - незачем.
        if (envelope.type === FRAME_PUSH) return

        hub.route(envelope, data, Date.now())
      } catch (error) {
        // Причина, никогда не байты: чужой кадр - не наш, чтобы его записывать.
        log(
          `${addressHint(address)} sent a frame we could not read: ${error instanceof Error ? error.message : 'unknown'}`,
        )

        if (!proven) connection.close(CLOSE_UNPROVEN, 'the proof of the address does not hold')
      }
    })

    connection.on('close', () => {
      clearTimeout(late)
      clearInterval(window)
      answered.delete(connection)

      if (!proven) return

      hub.close(address, connection)
      log(`${kind} ${addressHint(address)} left (${hub.count()} live)`)
    })

    // Упавший сокет - обычный конец: сторона переподключится и догонит.
    connection.on('error', () => undefined)
  }

  const sweeping = setInterval(() => mailboxes.sweep(Date.now()), 30_000)

  sweeping.unref()

  // Сокет, умерший молча (крышка ноутбука, тоннель), иначе считался бы живым до таймаута TCP -
  // минуты, за которые кадры уходили бы в никуда. Не ответил на пинг до следующего - закрыт, а
  // недавние отправители записаны в ящик: вернувшийся первым услышит «переспроси».
  const pinging = setInterval(() => {
    for (const [socket, entry] of answered) {
      if (!entry.alive) {
        log(`${addressHint(entry.address)} did not answer a ping - closing`)
        hub.lost(entry.address, socket, Date.now())
        answered.delete(socket)
        socket.terminate()
        continue
      }

      entry.alive = false
      socket.ping()
    }
  }, config.pingIntervalMs)

  pinging.unref()

  return {
    listen: (port) =>
      new Promise((resolve) => {
        http.listen(port, () => {
          const taken = http.address()

          resolve(typeof taken === 'object' && taken ? taken.port : port)
        })
      }),
    close: () =>
      new Promise((resolve) => {
        clearInterval(sweeping)
        clearInterval(pinging)

        for (const client of sockets.clients) client.terminate()

        sockets.close()
        http.close(() => resolve())
        http.closeAllConnections()
      }),
    connections: () => hub.count(),
  }
}
