import { stat } from 'node:fs/promises'

import { AcpProcess, isAuthError } from '../client/acp-process'
import { ACP_CLIENT_CAPABILITIES } from '../client/acp.constants'
import type { AgentDriver } from '../../agents/conversation/agent-parts'
import type { AcpHost } from './acp-conversation'
import { acpOf, attachAcp } from './acp-conversation'
import { AcpSession } from './acp-session'

/**
 * Драйвер ACP для разговоров ядра (ADR 0083, 0092): сессия - процесс агента в папке проекта
 * (своя папка IDE и коннекторы IDE через шлюз), сессия разговора в нём. Модель, усилие и режим
 * сессия берёт перед ходом, поэтому смена настроек вкладки ничего не шлёт - кроме режима, который
 * у агента задаётся запуском процесса (`agy` без вопросов): тогда процесс поднимается заново.
 * host - сервис панели, берётся при каждом вызове: он же держит драйвер.
 */
export const acpDriver = (host: () => AcpHost): AgentDriver => ({
  attach: (runtime) => {
    const kit = attachAcp(runtime, host())

    return { feed: kit.feed, shells: kit.shells }
  },

  open: async (runtime) => {
    const kit = acpOf(runtime)
    const cli = await kit.host.cli()

    if (!cli) {
      runtime.update({ error: 'cli-not-found' })

      return null
    }

    const info = await stat(runtime.meta.projectPath).catch(() => null)

    // Папку проекта удалили или переименовали, пока он открыт: агент упал бы на ней.
    if (!info?.isDirectory()) {
      runtime.update({ error: 'project-missing' })

      return null
    }

    const launch = kit.host.agent.launch(runtime.meta.permissionMode)
    const connectors = kit.host.connectors(runtime.meta.projectPath)
    let session: AcpSession | null = null

    connectors.launch?.own({ conversationId: runtime.meta.id, workDir: runtime.meta.projectPath })
    if (connectors.launch) runtime.connectors = connectors.launch
    kit.servers = connectors.servers.map((server) => server.name)
    kit.allowed = connectors.launch?.allowed ?? []

    const process = new AcpProcess(
      {
        binary: cli.binary,
        args: launch.args,
        cwd: runtime.meta.projectPath,
        env: { ...cli.env, ...launch.env },
        capabilities: ACP_CLIENT_CAPABILITIES,
        version: kit.host.version,
      },
      {
        onNotification: (method, params) => session?.handleNotification(method, params),
        onRequest: (method, params) =>
          session ? session.handleRequest(method, params) : Promise.reject(new Error('no session')),
        onExit: (code, stderrTail) => {
          // Процесс кончился - его ключ шлюза больше не нужен.
          connectors.launch?.release()
          session?.handleExit(code, stderrTail)
        },
      },
    )

    session = new AcpSession(runtime, process, connectors.servers)
    session.launchedMode = runtime.meta.permissionMode

    try {
      await session.begin()
    } catch (error) {
      connectors.launch?.release()
      void process.stop()

      // Не вошли: строка «войдите» с кнопкой входа, сообщение ждёт в очереди.
      if (isAuthError(error)) {
        kit.host.onSignedOut()
        kit.feed.builder.addNotice('not-logged-in', error instanceof Error ? error.message : '')
        kit.feed.flush()

        return null
      }

      throw error
    }

    kit.session = session

    return session
  },

  // Всё едет перед ходом (acp-options.ts). Режим, который задаёт запуск процесса (флаг агента),
  // поменялся - процесс поднимается заново, как освободится.
  setOptions: (runtime, options) => {
    runtime.update({
      ...(options.model !== undefined && { model: options.model }),
      ...(options.effort !== undefined && { effort: options.effort }),
      ...(options.permissionMode !== undefined && { permissionMode: options.permissionMode }),
    })

    const kit = acpOf(runtime)
    const live = kit.live

    if (!live || options.permissionMode === undefined) return

    const { agent } = kit.host
    const before = agent.launch(live.launchedMode).args.join(' ')
    const after = agent.launch(options.permissionMode).args.join(' ')

    if (before !== after) runtime.restartSession()
  },
})
