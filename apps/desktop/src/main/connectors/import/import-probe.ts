import type { McpAuth, McpTransport } from '@shared/connectors'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import { CLIENT_NAME } from '../connectors.constants'
import { isUnauthorized } from '../kinds/unauthorized'

/** Сколько ждать ответа сервера на пробе: недоступный не должен держать импорт. */
const PROBE_TIMEOUT_MS = 8000

/**
 * Пускает ли сервер по адресу без входа: подключиться без ключа его же протоколом (SSE или
 * Streamable HTTP). Попросил вход (401) - oauth, пустил - none. Любой другой сбой -
 * unreachable: вход тогда не узнать, и угадывать OAuth для сервера, который просто лежит,
 * значило бы сделать коннектор, в который не войти.
 */
export const probeAuth = async (
  url: string,
  transport: McpTransport,
): Promise<McpAuth | 'unreachable'> => {
  const client = new Client({ name: CLIENT_NAME, version: '0' })
  const options = { requestInit: { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) } }
  let timer: NodeJS.Timeout | undefined
  // Поток SSE сигнал запроса не слушает: потолок - на всё подключение целиком.
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Сервер не ответил на пробе')), PROBE_TIMEOUT_MS)
  })

  try {
    await Promise.race([
      client.connect(
        transport === 'sse'
          ? new SSEClientTransport(new URL(url), options)
          : new StreamableHTTPClientTransport(new URL(url), options),
      ),
      deadline,
    ])

    return 'none'
  } catch (error) {
    return isUnauthorized(error) ? 'oauth' : 'unreachable'
  } finally {
    clearTimeout(timer)
    await client.close().catch(() => undefined)
  }
}
