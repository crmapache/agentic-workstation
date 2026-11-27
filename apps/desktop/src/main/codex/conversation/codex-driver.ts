import { stat } from 'node:fs/promises'

import { CODEX_CLIENT } from '../codex.constants'
import { AppServerProcess } from '../app-server/app-server-process'
import type { AgentDriver } from '../../agents/conversation/agent-parts'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import type { GatewayLaunch } from '../../connectors/gateway/launches'
import { connectorArgs, GATEWAY_TOKEN_ENV } from './codex-connectors'
import type { CodexHost } from './codex-conversation'
import { codexOf, attachCodex } from './codex-conversation'
import { CodexSession } from './codex-session'

/**
 * Коннекторы IDE для нового процесса (как у Claude): ключ шлюза - в памяти, на диск ничего не
 * пишется, поэтому и не выдаться ему нечему. Процесс сразу назван разговором.
 */
const connectorsLaunch = (runtime: ConversationRuntime): GatewayLaunch | null => {
  const launch = codexOf(runtime).host.connectors(runtime.meta.projectPath)

  launch?.own({ conversationId: runtime.meta.id, workDir: runtime.meta.projectPath })

  if (launch) runtime.connectors = launch

  return launch
}

/**
 * Драйвер Codex для разговоров ядра (ADR 0083): сессия - процесс `codex app-server` в папке
 * проекта на выбранном аккаунте, поток разговора в нём; режим, модель и усилие - на каждом
 * ходе, поэтому смена настроек сессии ничего не шлёт. host - сервис панели, берётся при
 * каждом вызове: он же держит драйвер.
 */
export const codexDriver = (host: () => CodexHost): AgentDriver => ({
  attach: (runtime) => {
    const codex = attachCodex(runtime, host())

    return { feed: codex.feed, shells: codex.shells }
  },

  open: async (runtime) => {
    const codex = codexOf(runtime)
    const cli = await codex.host.cli()

    if (!cli) {
      runtime.update({ error: 'cli-not-found' })

      return null
    }

    const info = await stat(runtime.meta.projectPath).catch(() => null)

    // Папку проекта удалили или переименовали, пока он открыт: Codex упал бы на cwd.
    if (!info?.isDirectory()) {
      runtime.update({ error: 'project-missing' })

      return null
    }

    let session: CodexSession | null = null
    const connectors = connectorsLaunch(runtime)
    const userServers = await codex.host.userMcpServers()
    const server = new AppServerProcess(
      {
        binary: cli.binary,
        args: connectorArgs(connectors?.servers ?? [], userServers, {
          allowed: connectors?.allowed,
        }),
        cwd: runtime.meta.projectPath,
        env: connectors ? { ...cli.env, [GATEWAY_TOKEN_ENV]: connectors.token } : cli.env,
        client: { ...CODEX_CLIENT, version: codex.host.version() },
      },
      {
        onNotification: (method, params) => session?.handleNotification(method, params),
        onServerRequest: (id, method, params) => session?.handleServerRequest(id, method, params),
        onExit: (code, stderrTail) => {
          // Процесс кончился - его ключ шлюза и процессы команд больше не нужны.
          connectors?.release()
          session?.handleExit(code, stderrTail)
        },
      },
    )

    session = new CodexSession(runtime, server)

    try {
      await session.begin()
    } catch (error) {
      connectors?.release()
      void server.stop()
      throw error
    }

    codex.session = session

    return session
  },

  // Всё едет с ходом (codex-session.ts): живой сессии сейчас слать нечего.
  setOptions: (runtime, options) => {
    const codex = codexOf(runtime)
    // Модель без быстрого уровня по каталогу снимает просьбу панели, и сама она не вернётся.
    // Уровень из конфига Codex не трогается: его Codex применит или выбросит сам.
    const losesFast =
      options.model !== undefined &&
      options.fastMode === undefined &&
      runtime.meta.fastMode === true &&
      codex.host.model(options.model)?.fast === false
    const fastMode = losesFast ? false : options.fastMode

    // Новая просьба - и отказ по прежней причине снова новость: строка FAST встанет опять.
    if (fastMode === true && runtime.meta.fastMode !== true) codex.fastNoted = ''

    runtime.update({
      ...(options.model !== undefined && { model: options.model }),
      ...(options.effort !== undefined && { effort: options.effort }),
      ...(options.permissionMode !== undefined && { permissionMode: options.permissionMode }),
      // Смена просьбы стирает прошлый ответ: он был о другой просьбе.
      ...(fastMode !== undefined && { fastMode, fastReport: undefined }),
    })
  },
})
