import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'

import { SignedOutError } from '../connector-source'
import type { SourceTool, ConnectorSource } from '../connector-source'
import { classifyTool } from '../tool-access'

/** Соединение и сколько вызовов по нему идёт: закрывать его можно, только когда их нет. */
type Connection = { client: Promise<Client>; inflight: number; detached: boolean }

/**
 * Потолок вызова инструмента - как у Claude Code (MCP_TOOL_TIMEOUT по умолчанию около
 * суток), а не 60 секунд SDK: долгий инструмент (ожидание в Playwright, свой скрипт)
 * иначе получил бы отказ, продолжая работать, и модель повторила бы запись.
 */
const CALL_TIMEOUT_MS = 100_000_000

const withAccess = (tool: Tool): SourceTool => ({
  ...tool,
  access: classifyTool(tool.name, tool.annotations),
})

const closeClient = (connection: Connection): Promise<void> =>
  connection.client.then((client) => client.close()).catch(() => undefined)

/** Ответы SDK о самой связи: соединение закрылось, ответа не дождались. */
const LINK_CODES: ReadonlySet<number> = new Set([
  ErrorCode.ConnectionClosed,
  ErrorCode.RequestTimeout,
])

/**
 * Сбой связи, после которого соединение больше не годится: всё, что не ответ сервера, и
 * ответы SDK о самой связи. Ответ сервера с ошибкой (JSON-RPC) соединение не трогает.
 */
const isLinkFailure = (error: unknown): boolean =>
  !(error instanceof McpError) || LINK_CODES.has(error.code)

/**
 * Чужой MCP-сервер за шлюзом - по адресу или командой на этой машине. Соединение
 * поднимается по первому запросу. Сбой связи отвязывает только то соединение, на котором
 * шёл вызов, и закрывает его, когда по нему не осталось вызовов: соседний вызов не
 * обрывается посреди записи, а следующий поднимет соединение заново. Не поднялось вовсе
 * (команда упала на старте, сервер молчит) - тоже отвязывается: повтор и кнопка Retry
 * пробуют снова, а не натыкаются на прежний отказ.
 */
export abstract class ClientSource implements ConnectorSource {
  private connection: Connection | null = null
  private disposed = false

  listTools(): Promise<SourceTool[]> {
    // Чтение можно повторить: сервер мог закрыть сессию, пока IDE стояла.
    const list = () =>
      this.withClient(async (client) => {
        const tools: Tool[] = []
        let cursor: string | undefined

        do {
          const page = await client.listTools(cursor ? { cursor } : undefined)

          tools.push(...page.tools)
          cursor = page.nextCursor
        } while (cursor)

        return tools.map(withAccess)
      })

    return list().catch((error: unknown) => {
      if (error instanceof SignedOutError || this.disposed) throw error

      return list()
    })
  }

  /**
   * Вызов не повторяется: оборвавшийся вызов мог успеть выполниться у сервиса, и повтор
   * создал бы вторую страницу или второй черновик.
   */
  callTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<CallToolResult> {
    return this.withClient(
      async (client) =>
        (await client.callTool({ name, arguments: args }, undefined, {
          timeout: CALL_TIMEOUT_MS,
          ...(signal ? { signal } : {}),
        })) as CallToolResult,
    )
  }

  /** Закрыть соединение навсегда: вызов, пришедший после, не поднимет процесс заново. */
  async dispose(): Promise<void> {
    const connection = this.connection

    this.disposed = true
    this.connection = null

    if (connection) await closeClient(connection)
  }

  /** Поднять соединение с сервером. */
  protected abstract open(): Promise<Client>

  /** Что сделать до запроса (обновить токен заранее). */
  protected beforeRequest(): Promise<void> {
    return Promise.resolve()
  }

  /** Перевести ошибку: «вход пропал» - SignedOutError, остальное как есть. */
  protected explain(error: unknown): unknown {
    return error
  }

  private async withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
    await this.beforeRequest()

    const connection = this.connect()

    connection.inflight += 1

    try {
      // Не поднялось - отвязать всегда, каким бы ни был отказ: иначе отклонённое соединение
      // осталось бы на месте и отвечало тем же отказом до перезапуска IDE.
      const client = await connection.client.catch((error: unknown) => {
        this.detach(connection)
        throw error
      })

      return await run(client)
    } catch (error) {
      if (isLinkFailure(error)) this.detach(connection)

      throw this.explain(error)
    } finally {
      connection.inflight -= 1

      if (connection.detached && connection.inflight === 0) void closeClient(connection)
    }
  }

  private detach(connection: Connection): void {
    connection.detached = true

    if (this.connection === connection) this.connection = null
  }

  private connect(): Connection {
    if (this.disposed) throw new Error('Источник коннектора закрыт')

    this.connection ??= { client: this.open(), inflight: 0, detached: false }

    return this.connection
  }
}
