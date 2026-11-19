import { createHash } from 'node:crypto'
import type { Server, ServerResponse, IncomingMessage } from 'node:http'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'

import { randomToken } from '../../connectors/oauth/pkce'

/** Подключение, к которому ходят через прокси: его адрес и ключ - в момент запроса. */
export type ProxyTarget = { baseUrl: string; key: string }

/** Ключ процесса у прокси: какие подключения ему можно; отозвать - release. */
export type ProxyLease = { token: string; release: () => void }

/** Заголовки ответа, которые прокси отдаёт как есть: тип и как идёт поток. */
const PASSED_HEADERS = ['content-type', 'cache-control', 'x-request-id']

const digest = (token: string): string => createHash('sha256').update(token).digest('hex')

/**
 * Локальный прокси облачных подключений (ADR 0084): настоящий ключ OpenRouter или своего адреса
 * не уходит в процесс OpenCode - иначе его прочла бы любая команда агента (окружение процесса,
 * `ps eww`). OpenCode получает адрес `http://127.0.0.1:<порт>/<подключение>` и ключ своего
 * процесса; прокси сверяет его, подставляет настоящий ключ и гонит ответ потоком. Ключ
 * процесса отзывается, когда процесс кончился, - как ключи шлюза коннекторов.
 */
export class ModelProxy {
  private server: Server | null = null
  private port = 0
  private readonly leases = new Map<string, ReadonlySet<string>>()

  constructor(private readonly targetOf: (connectionId: string) => ProxyTarget | null) {}

  /** Адрес подключения у прокси; прокси поднимается при первом вопросе. */
  async baseUrlOf(connectionId: string): Promise<string> {
    await this.start()

    return `http://127.0.0.1:${this.port}/${connectionId}`
  }

  /** Ключ процесса на эти подключения. */
  lease(connectionIds: readonly string[]): ProxyLease {
    const token = randomToken()
    const key = digest(token)

    this.leases.set(key, new Set(connectionIds))

    return { token, release: () => this.leases.delete(key) }
  }

  async stop(): Promise<void> {
    const server = this.server

    this.server = null
    this.leases.clear()
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private async start(): Promise<void> {
    if (this.server) return

    const server = createServer((request, response) => void this.handle(request, response))

    this.server = server
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    this.port = (server.address() as AddressInfo).port
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const [, connectionId = '', ...rest] = url.pathname.split('/')
    const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1] ?? ''
    const allowed = this.leases.get(digest(bearer))
    const target = allowed?.has(connectionId) ? this.targetOf(connectionId) : null

    if (!target || (request.method !== 'GET' && request.method !== 'POST')) {
      response.writeHead(target ? 405 : 401).end()

      return
    }

    const body = request.method === 'POST' ? await readBody(request) : undefined
    const upstreamUrl = `${target.baseUrl.replace(/\/+$/, '')}/${rest.join('/')}${url.search}`
    const abort = new AbortController()

    // Клиент ушёл (ход прервали) - и запрос к модели снимается: токены не жгутся впустую.
    response.on('close', () => abort.abort())

    try {
      const upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers: {
          authorization: `Bearer ${target.key}`,
          'content-type': request.headers['content-type'] ?? 'application/json',
          accept: request.headers.accept ?? '*/*',
        },
        ...(body !== undefined && { body }),
        signal: abort.signal,
      })

      response.writeHead(
        upstream.status,
        Object.fromEntries(
          PASSED_HEADERS.flatMap((name) => {
            const value = upstream.headers.get(name)

            return value ? [[name, value]] : []
          }),
        ),
      )

      if (!upstream.body) {
        response.end()

        return
      }

      Readable.fromWeb(upstream.body as NodeReadableStream<Uint8Array>)
        .on('error', () => response.destroy())
        .pipe(response)
    } catch (error) {
      if (!response.headersSent) response.writeHead(502)
      response.end(error instanceof Error ? error.message : String(error))
    }
  }
}

const readBody = (request: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
