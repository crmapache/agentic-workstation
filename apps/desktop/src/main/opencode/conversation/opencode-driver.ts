import { stat } from 'node:fs/promises'

import { OpenCodeServer } from '../server/opencode-server'
import type { AgentDriver } from '../../agents/conversation/agent-parts'
import type { OpenCodeHost } from './opencode-conversation'
import { openCodeOf, attachOpenCode } from './opencode-conversation'
import { isCompactWindow } from './opencode-instructions'
import { OpenCodeSession } from './opencode-session'

/**
 * Драйвер OpenCode для разговоров ядра (ADR 0083, 0084): сессия - процесс
 * `opencode serve --stdio` в папке проекта со своим конфигом (подключения, модели,
 * коннекторы IDE), сессия разговора в нём. Модель, усилие и режим сессия берёт перед ходом,
 * поэтому смена настроек вкладки ничего не шлёт. host - сервис панели, берётся при каждом
 * вызове: он же держит драйвер.
 */
export const openCodeDriver = (host: () => OpenCodeHost): AgentDriver => ({
  attach: (runtime) => {
    const kit = attachOpenCode(runtime, host())

    return { feed: kit.feed, shells: kit.shells }
  },

  open: async (runtime) => {
    const kit = openCodeOf(runtime)
    const cli = await kit.host.cli()

    if (!cli) {
      runtime.update({ error: 'cli-not-found' })

      return null
    }

    const info = await stat(runtime.meta.projectPath).catch(() => null)

    // Папку проекта удалили или переименовали, пока он открыт: OpenCode упал бы на ней.
    if (!info?.isDirectory()) {
      runtime.update({ error: 'project-missing' })

      return null
    }

    const launch = await kit.host.launch(runtime.meta.projectPath, runtime.meta.model)
    const { connectors } = launch
    let session: OpenCodeSession | null = null

    connectors?.own({ conversationId: runtime.meta.id, workDir: runtime.meta.projectPath })
    if (connectors) runtime.connectors = connectors
    kit.servers = launch.servers
    kit.allowedActions = launch.allowedActions
    kit.compact = launch.compact

    const server = new OpenCodeServer(
      {
        binary: cli.binary,
        cwd: runtime.meta.projectPath,
        env: { ...cli.env, ...launch.env },
        dirs: kit.host.dirs(),
        config: launch.config,
      },
      {
        onEvent: (event) => session?.handleEvent(event),
        onExit: (code, stderrTail) => {
          // Процесс кончился - его ключи шлюза и прокси моделей и процессы команд больше не нужны.
          connectors?.release()
          launch.release()
          session?.handleExit(code, stderrTail)
        },
      },
    )

    session = new OpenCodeSession(runtime, server, cli.env)

    try {
      await session.begin()
    } catch (error) {
      connectors?.release()
      launch.release()
      void server.stop()
      throw error
    }

    kit.session = session

    return session
  },

  // Всё едет перед ходом (opencode-session.ts): живой сессии сейчас слать нечего. Одно
  // исключение - модель по ту сторону границы окна (ADR 0089): указания у процесса другие,
  // и он поднимается заново, как освободится, - до следующего хода.
  setOptions: (runtime, options) => {
    runtime.update({
      ...(options.model !== undefined && { model: options.model }),
      ...(options.effort !== undefined && { effort: options.effort }),
      ...(options.permissionMode !== undefined && { permissionMode: options.permissionMode }),
    })

    const kit = openCodeOf(runtime)

    if (options.model === undefined || kit.compact === null) return

    const model = options.model || (kit.host.defaultModel() ?? '')

    if (isCompactWindow(kit.host.contextWindow(model)) !== kit.compact) runtime.restartSession()
  },
})
