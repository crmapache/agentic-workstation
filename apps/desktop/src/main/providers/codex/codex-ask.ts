import { mkdir } from 'node:fs/promises'

import type { AskOnce, AskOnceResult } from '../run-stream/ask-once'
import { jsonOf, toolsByServer } from '../run-stream/ask-once'
import { CODEX_CLIENT } from '../../codex/codex.constants'
import { AppServerProcess } from '../../codex/app-server/app-server-process'
import { connectorArgs, GATEWAY_TOKEN_ENV } from '../../codex/conversation/codex-connectors'
import { noBuiltInToolsArgs } from './codex-restrictions'
import type { CodexRunHost } from './codex-run-process'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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
  // Ключ с допуском выдал спросивший и отзовёт сам; свой - только у вопроса по проекту.
  const own = !ask.gateway && mcp ? host.gateway(mcp.projectPath, []) : null
  const launch = ask.gateway ?? own
  const readable = toolsByServer(ask.gateway?.allowed ?? mcp?.tools ?? [])

  let said = ''
  let finish: (result: AskOnceResult) => void = () => undefined
  const done = new Promise<AskOnceResult>((resolve) => (finish = resolve))
  const server = new AppServerProcess(
    {
      binary: cli.binary,
      args: [
        // Серверы шлюза - только с разрешёнными поимённо инструментами: чтение или допуск. Они
        // же одобрены: спросить некого, а в never с песочницей только чтения Codex отказал бы
        // всему без пометки «только чтение», и чтению из коннектора без пометок тоже (ADR 0131).
        ...connectorArgs(launch?.servers ?? [], userServers, {
          onlyTools: readable,
          approved: true,
        }),
        // Автору сценария - чтение проекта командной строкой; остальным - ни команд, ни файлов.
        ...(ask.readProject ? [] : noBuiltInToolsArgs()),
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
    own?.release()
  }
}
