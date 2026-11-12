import type { ServerResponse, IncomingMessage, OutgoingHttpHeaders } from 'node:http'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { Duplex } from 'node:stream'
import { connect as tlsConnect } from 'node:tls'

import { readConfig } from '@agentic-workstation/relay/config'
import { createRelay } from '@agentic-workstation/relay/server'

/**
 * Своя сборка телефона против боевого релея - проверка правки клиента до выкладки. Боевой релей
 * раздаёт ту сборку, что выложена, а страница может говорить только со своим хостом (CSP, проверка
 * Origin у релея). Поэтому страница - с локального адреса: файлы и их заголовки отдаёт свой релей
 * из dist, а всё под /v1/ (сокеты телефона, /v1/info) уходит боевому с его Host и Origin. Сеть и
 * релей - настоящие, клиент - свой.
 */

const isLive = (url: string | undefined): boolean => (url ?? '').startsWith('/v1/')

/** Запрос как есть дальше, ответ как есть обратно. */
const forward = (
  target: URL,
  headers: OutgoingHttpHeaders,
  request: IncomingMessage,
  response: ServerResponse,
): void => {
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest
  const upstream = send(
    {
      hostname: target.hostname,
      port: target.port || undefined,
      path: request.url,
      method: request.method,
      headers,
    },
    (answer) => {
      response.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(response)
    },
  )

  upstream.on('error', () => response.destroy())
  request.pipe(upstream)
}

/** Рукопожатие WebSocket боевому релею - как его прислал браузер, но от имени его страницы. */
const upgradeLive = (live: URL, request: IncomingMessage, socket: Duplex, head: Buffer): void => {
  const upstream = tlsConnect({
    host: live.hostname,
    port: Number(live.port) || 443,
    servername: live.hostname,
  })
  const lines = [`${request.method ?? 'GET'} ${request.url ?? '/'} HTTP/1.1`]

  for (let at = 0; at < request.rawHeaders.length; at += 2) {
    const name = request.rawHeaders[at] ?? ''
    const lower = name.toLowerCase()
    const value =
      lower === 'host' ? live.host : lower === 'origin' ? live.origin : request.rawHeaders[at + 1]

    lines.push(`${name}: ${value ?? ''}`)
  }

  upstream.on('secureConnect', () => {
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (head.length > 0) upstream.write(head)
    upstream.pipe(socket)
    socket.pipe(upstream)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
  socket.on('close', () => upstream.destroy())
}

/** Локальная страница своей сборки перед боевым релеем; close - погасить оба своих сервера. */
export const startLivePage = async (staticDir: string, liveUrl: string) => {
  const live = new URL(liveUrl)
  const files = createRelay({ ...readConfig({}), staticDir, logLevel: 'silent' }, () => undefined)
  const filesUrl = new URL(`http://127.0.0.1:${await files.listen(0)}`)
  const sockets = new Set<Duplex>()
  const server = createServer((request, response) => {
    if (isLive(request.url)) {
      forward(live, { ...request.headers, host: live.host }, request, response)
    } else {
      // Host страницы, а не своего релея: по нему релей пишет в CSP, куда странице звонить.
      forward(filesUrl, request.headers, request, response)
    }
  })

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!isLive(request.url)) return socket.destroy()

    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    upgradeLive(live, request, socket, head)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  return {
    pageUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      for (const socket of sockets) socket.destroy()
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await files.close()
    },
  }
}
