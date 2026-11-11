import type { McpAuth, McpTransport } from '@shared/connectors'
import { auth } from '@modelcontextprotocol/sdk/client/auth.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import type { SecretsOf } from '../connector-secrets'
import { SignedOutError } from '../connector-source'
import { CLIENT_NAME } from '../connectors.constants'
import { McpAuthProvider } from '../oauth/mcp-auth-provider'
import { ClientSource } from './client-source'
import { isUnauthorized } from './unauthorized'

export type RemoteMcpOptions = {
  /** Читается на каждом подключении: у своего MCP полный адрес лежит в секретах. */
  url: () => string
  auth: McpAuth
  transport: McpTransport
  secrets: SecretsOf
  version: string
}

/**
 * MCP-сервер по адресу: Notion, Slack, свой (Streamable HTTP или прежний SSE). Вход - OAuth
 * через хранилище IDE, ключ Bearer или свои заголовки из секретов. Токен OAuth обновляется
 * заранее и одним запросом на коннектор - параллельные вызовы не обновляют его наперегонки
 * одним токеном обновления.
 */
export class RemoteMcpSource extends ClientSource {
  private refreshing: Promise<void> | null = null

  constructor(private readonly options: RemoteMcpOptions) {
    super()
  }

  /** Токен вот-вот истечёт - обновить до запроса, один раз на всех ждущих. */
  protected override async beforeRequest(): Promise<void> {
    if (this.options.auth !== 'oauth') return

    const provider = new McpAuthProvider(this.options.secrets)

    if (!provider.expiresSoon()) return

    this.refreshing ??= auth(provider, { serverUrl: this.options.url() })
      .then(() => undefined)
      .catch((error: unknown) => console.warn('[connectors] токен MCP не обновился', error))
      .finally(() => {
        this.refreshing = null
      })

    await this.refreshing
  }

  /**
   * «Нужен вход» - только когда его правда нет: у OAuth - токенов больше нет (SDK стёр
   * отказанные), у ключа - сервер его не принял. Иначе 401 - сбой сервера, а не выход.
   */
  protected override explain(error: unknown): unknown {
    if (!isUnauthorized(error)) return error

    if (this.options.auth === 'token') return new SignedOutError('Ключ не принят')

    if (this.options.auth === 'oauth' && !this.options.secrets.read().tokens) {
      return new SignedOutError('Нужен вход')
    }

    return error
  }

  protected override async open(): Promise<Client> {
    const { url, auth: kind, transport, secrets, version } = this.options
    const { bearer, headers = {} } = secrets.read()

    if (kind === 'token' && !bearer) throw new SignedOutError('Нет ключа')

    const options = {
      ...(kind === 'oauth' ? { authProvider: new McpAuthProvider(secrets) } : {}),
      requestInit: {
        headers: { ...headers, ...(kind === 'token' ? { Authorization: `Bearer ${bearer}` } : {}) },
      },
    }
    const address = new URL(url())
    const client = new Client({ name: CLIENT_NAME, version })

    // SSE в SDK помечен устаревшим, но серверы на нём ещё живут (импорт из конфига Claude
    // Code приносит и такие) - для них он и оставлен.
    await client.connect(
      transport === 'sse'
        ? new SSEClientTransport(address, options)
        : new StreamableHTTPClientTransport(address, options),
    )

    return client
  }
}
