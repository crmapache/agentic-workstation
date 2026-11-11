import { createServer } from 'node:http'
import type { ServerResponse, IncomingMessage, Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

/**
 * Что шлюз знает об одном сервере: пояснение для модели, инструменты и их вызов. signal -
 * провайдер ушёл, не дождавшись ответа (ход остановлен): вызов можно отменить у сервиса.
 */
export type GatewayServer = {
  instructions: () => string
  tools: () => Promise<Tool[]>
  call: (
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<CallToolResult>
}

/** Кого шлюз пускает и что ему показывает (gateway-host.ts). */
export type GatewayAccess<Launch> = {
  /** Процесс провайдера по ключу из Authorization; чужой ключ - null. */
  authorize: (token: string) => Launch | null
  /** Сервер по имени для этого процесса: не виден в его проекте - null. */
  resolve: (serverName: string, launch: Launch) => GatewayServer | null
}

const BEARER = /^Bearer (\S+)$/

const SERVER_PATH = /^\/mcp\/([a-z0-9-]+)$/

/** Имя сервера из адреса запроса; адрес не разбирается или путь не тот - null. */
const serverNameOf = (url: string | undefined): string | null => {
  try {
    return SERVER_PATH.exec(new URL(url ?? '/', 'http://127.0.0.1').pathname)?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Локальный MCP-шлюз IDE (ADR 0028, 0029): каждый коннектор - сервер по адресу
 * /mcp/<имя>. Слушает только 127.0.0.1 на порту от системы, пускает только с ключом,
 * выданным процессу провайдера, и только с Host этого адреса: страница в браузере, которая
 * угадала порт, через DNS rebinding до него не дотянется. Без сессий: каждый запрос - свой
 * сервер SDK, поэтому инструменты и пояснение всегда свежие.
 */
export class ConnectorGateway<Launch> {
  private http: HttpServer | null = null
  private port = 0

  constructor(
    private readonly access: GatewayAccess<Launch>,
    private readonly version: string,
  ) {}

  async start(): Promise<void> {
    // Ни один запрос не должен уронить главный процесс: что бы ни случилось внутри, ответ
    // уходит, а не повисает необработанным отказом.
    const http = createServer((request, response) => {
      this.handle(request, response).catch((error: unknown) => {
        console.warn('[connectors] шлюз не ответил', error)

        if (!response.headersSent) response.writeHead(500)

        response.end()
      })
    })

    await new Promise<void>((resolve, reject) => {
      http.once('error', reject)
      http.listen(0, '127.0.0.1', () => {
        http.off('error', reject)
        resolve()
      })
    })
    this.http = http
    this.port = (http.address() as AddressInfo).port
  }

  get isRunning(): boolean {
    return this.http !== null
  }

  /** Адрес сервера коннектора; шлюз не поднят - null. */
  urlOf(serverName: string): string | null {
    return this.http ? `http://127.0.0.1:${this.port}/mcp/${serverName}` : null
  }

  async stop(): Promise<void> {
    const http = this.http

    this.http = null

    if (http) await new Promise((resolve) => http.close(resolve))
  }

  /**
   * Сначала Host и ключ, потом разбор адреса: кривую строку запроса прислать может кто
   * угодно на этой машине, и до ключа она ничего не должна задевать.
   */
  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.host !== `127.0.0.1:${this.port}`) {
      response.writeHead(403).end()

      return
    }

    const token = BEARER.exec(request.headers.authorization ?? '')?.[1]
    const launch = token ? this.access.authorize(token) : null

    if (launch === null) {
      response.writeHead(401).end()

      return
    }

    const name = serverNameOf(request.url)
    const server = name ? this.access.resolve(name, launch) : null

    if (!name || !server) {
      response.writeHead(404).end()

      return
    }

    // Без сессий потока событий от сервера нет: GET и DELETE не нужны (спецификация MCP
    // разрешает ответить 405).
    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'POST' }).end()

      return
    }

    await this.serve(name, server, request, response).catch((error: unknown) => {
      console.warn('[connectors] шлюз не ответил серверу', name, error)

      if (!response.headersSent) response.writeHead(500).end()
    })
  }

  private async serve(
    name: string,
    target: GatewayServer,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    // Низкоуровневый Server, а не McpServer: инструменты приходят готовыми JSON Schema от
    // Notion или Slack и отдаются как есть, без описания на zod. SDK оставляет Server
    // как раз для такого (пометка deprecated - про обычные серверы).
    const server = new Server(
      { name, version: this.version },
      { capabilities: { tools: {} }, instructions: target.instructions() },
    )
    // Без генератора id сессий транспорт работает без сессий: каждый запрос сам по себе.
    // Ответ - потоком событий, а не одним JSON: пока инструмент работает (минуты ожидания в
    // Playwright), поток шлёт отметки «жив», и клиент не обрывает ответ по тайм-ауту.
    const transport = new StreamableHTTPServerTransport()

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await target.tools() }))
    server.setRequestHandler(CallToolRequestSchema, (call, extra) =>
      target.call(call.params.name, call.params.arguments ?? {}, extra.signal),
    )
    response.on('close', () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(request, response)
  }
}
