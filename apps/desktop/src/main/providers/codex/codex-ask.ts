import { mkdir } from 'node:fs/promises'

import type { AskOnce, AskOnceResult } from '../run-stream/ask-once'
import { jsonOf, toolsByServer } from '../run-stream/ask-once'
import { CODEX_CLIENT } from '../../codex/codex.constants'
import { AppServerProcess } from '../../codex/app-server/app-server-process'
import { connectorArgs, GATEWAY_TOKEN_ENV } from '../../codex/conversation/codex-connectors'
import type { GatewayEntry } from '../../connectors/gateway/mcp-config'
import { noBuiltInToolsArgs } from './codex-restrictions'
import type { CodexRunHost } from './codex-run-process'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Серверы шлюза только с инструментами чтения (`enabled_tools`): Codex не увидит у сервера
 * ничего другого, а разрешений он здесь не спрашивает. Сервер - целиком одной таблицей, как в
 * connectorArgs: флаг пути внутри сервера заменил бы таблицу без транспорта.
 */
const readServerArgs = (
  servers: readonly GatewayEntry[],
  readable: ReadonlyMap<string, readonly string[]>,
): string[] =>
  servers.flatMap((server) => {
    const tools = readable.get(server.name)

    return tools && /^[\w-]+$/.test(server.name)
      ? [
          '-c',
          `mcp_servers.${server.name}={url=${JSON.stringify(server.url)}, bearer_token_env_var="${GATEWAY_TOKEN_ENV}", enabled_tools=${JSON.stringify(tools)}}`,
        ]
      : []
  })

/**
 * Разовый вопрос Codex: эфемерный поток (в истории его нет), только чтение без вопросов,
 * свои серверы MCP человека выключены, ответ хода ограничен схемой (`outputSchema`), если
 * она есть. Процесс гаснет, как только ответ пришёл, вышло время или человек отменил.
 */
export const askCodexOnce = async (
  host: Pick<CodexRunHost, 'cli' | 'userMcpServers' | 'version' | 'gateway'>,
  accountId: string,
  ask: AskOnce,
): Promise<AskOnceResult> => {
  const cli = await host.cli(accountId)

  if (!cli) return { error: 'Codex is not installed or the account is gone.' }

  await mkdir(ask.cwd, { recursive: true })

  // Свои серверы человека выключаются поимённо: не прочитались - без вопроса их не выключить.
  const userServers = await host.userMcpServers()

  if (userServers === null) return { error: 'Codex MCP servers could not be read.' }
  // Отменили, пока искался CLI и читались серверы: процесс не нужен вовсе.
  if (ask.signal?.aborted) return { error: 'cancelled' }

  const mcp = ask.tools?.mcp ?? null
  const launch = mcp ? host.gateway(mcp.projectPath, []) : null
  const readable = toolsByServer(mcp?.tools ?? [])

  let said = ''
  let finish: (result: AskOnceResult) => void = () => undefined
  const done = new Promise<AskOnceResult>((resolve) => (finish = resolve))
  const server = new AppServerProcess(
    {
      binary: cli.binary,
      args: [
        ...connectorArgs([], userServers),
        // Автору сценария - чтение проекта командной строкой; остальным - ни команд, ни файлов.
        ...(ask.readProject ? [] : noBuiltInToolsArgs()),
        ...readServerArgs(launch?.servers ?? [], readable),
        ...(ask.tools?.web ? ['-c', 'web_search="live"'] : []),
      ],
      cwd: ask.cwd,
      env: launch ? { ...cli.env, [GATEWAY_TOKEN_ENV]: launch.token } : cli.env,
      client: { ...CODEX_CLIENT, version: host.version() },
    },
    {
      onNotification: (method, params) => {
        const body = isRecord(params) ? params : {}
        const item = isRecord(body['item']) ? body['item'] : {}

        if (method === 'item/completed' && item['type'] === 'agentMessage') {
          said = typeof item['text'] === 'string' ? item['text'] : said
        }

        if (method !== 'turn/completed') return

        const turn = isRecord(body['turn']) ? body['turn'] : {}
        const error = isRecord(turn['error']) ? turn['error']['message'] : null
        finish(
          turn['status'] === 'completed' && said
            ? { text: said, output: jsonOf(said) }
            : { error: typeof error === 'string' ? error : 'Codex did not answer.' },
        )
      },
      // Вопросов в только чтении без вопросов не бывает; если всё же спросит - отказ.
      onServerRequest: (id) => server.respondError(id, -32601, 'No questions in a one-shot ask'),
      onExit: (_code, tail) => finish({ error: tail.trim().split('\n').at(-1) || 'Codex exited.' }),
    },
  )
  const timer = setTimeout(() => finish({ error: 'Codex took too long to answer.' }), ask.timeoutMs)
  const cancel = () => finish({ error: 'cancelled' })

  ask.signal?.addEventListener('abort', cancel, { once: true })

  try {
    const model = ask.model || null
    const reply = await server.request('thread/start', {
      cwd: ask.cwd,
      model,
      approvalPolicy: 'never',
      sandbox: 'read-only',
      ephemeral: true,
      developerInstructions: ask.system ?? null,
    })
    const thread = isRecord(reply) && isRecord(reply['thread']) ? reply['thread'] : {}

    await server.request('turn/start', {
      threadId: thread['id'],
      input: [{ type: 'text', text: ask.prompt, text_elements: [] }],
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
      model,
      effort: ask.effort || null,
      ...(ask.schema && { outputSchema: ask.schema }),
    })

    return await done
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
    ask.signal?.removeEventListener('abort', cancel)
    void server.stop()
    launch?.release()
  }
}
