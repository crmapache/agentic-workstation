import type { HttpConnectorSpec } from '@shared/connector-spec'
import type { ToolAccess } from '@shared/connectors'
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import { ArgumentError } from '../native-tools'
import { toolError, SignedOutError } from '../../connector-source'
import type { SourceTool, ConnectorSource } from '../../connector-source'
import { classifyTool } from '../../tool-access'
import { buildRequest } from './http-request'
import type { HttpCredentials } from './http-request'
import { responseText } from './http-response'

/** Сколько ждать сервис: дольше - модель получит отказ, а не повиснет. */
const REQUEST_TIMEOUT_MS = 30_000

const STRICTNESS: Record<ToolAccess, number> = { read: 0, write: 1, outbound: 2 }

/**
 * Ступень строже из двух: ИИ мог назвать «отправить сообщение» записью - имя его выдаст.
 * Ошибиться в сторону «отправка» безопаснее: её включает человек.
 */
const stricter = (a: ToolAccess, b: ToolAccess): ToolAccess =>
  STRICTNESS[a] >= STRICTNESS[b] ? a : b

/**
 * Коннектор, описанный ИИ (ADR 0029): инструменты - запросы из описания, шлюз сам
 * подставляет ключ и не пускает запрос за пределы baseUrl. Ответ сервиса уходит модели
 * текстом (JSON как есть), отказ - с кодом и началом ответа.
 */
export class HttpSpecSource implements ConnectorSource {
  constructor(
    private readonly spec: HttpConnectorSpec,
    private readonly credentials: () => HttpCredentials | null,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  listTools(): Promise<SourceTool[]> {
    return Promise.resolve(
      this.spec.tools.map((tool) => {
        const access = stricter(tool.access, classifyTool(tool.name))

        return {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as Tool['inputSchema'],
          access,
          annotations: { readOnlyHint: access === 'read' },
        }
      }),
    )
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<CallToolResult> {
    const tool = this.spec.tools.find((candidate) => candidate.name === name)

    if (!tool) return toolError(`Unknown tool ${name}`)

    const credentials = this.credentials()

    if (!credentials) throw new SignedOutError('Нет ключа')

    let request

    try {
      request = buildRequest(this.spec.baseUrl, this.spec.auth, tool, args, credentials)
    } catch (error) {
      if (error instanceof ArgumentError) return toolError(error.message)

      throw error
    }

    const response = await this.fetchFn(request.url, {
      ...request.init,
      signal: AbortSignal.any([
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ...(signal ? [signal] : []),
      ]),
    })

    if (response.status === 401) {
      await response.body?.cancel().catch(() => undefined)

      throw new SignedOutError('Ключ не принят')
    }

    const text = await responseText(response)

    if (!response.ok) {
      return toolError(`${this.spec.service} answered ${response.status}: ${text.slice(0, 2000)}`)
    }

    return { content: [{ type: 'text', text: text || '(empty response)' }] }
  }

  dispose(): Promise<void> {
    return Promise.resolve()
  }
}
