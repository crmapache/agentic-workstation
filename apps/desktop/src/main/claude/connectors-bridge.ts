import type { ConversationRuntime } from '../agents/conversation/conversation-runtime'
import { claudeOf } from './conversation/claude-conversation'
import type { ConnectorsLaunch } from './conversation/connectors-launch'

/**
 * Коннекторы IDE для процессов разговоров (ADR 0028, 0029). Серверы шлюза CLI получает
 * файлом `--mcp-config` своего проекта при запуске и перечитывает только при следующем -
 * поэтому новый, удалённый или включённый в проекте коннектор перезапускает процессы этих
 * проектов, как только они свободны. А то, что поменялось внутри сервера (вход, выключенный
 * инструмент), живой процесс подхватывает переподключением сервера, без перезапуска.
 */
export class ConnectorsBridge {
  /**
   * Конфиг шлюза для нового процесса в проекте; null - коннекторов в нём нет или шлюз не
   * поднялся. ideServers - свои серверы IDE только этому процессу (поручение). Ставит index.ts.
   */
  configFor: (
    projectPath: string,
    ideServers?: readonly string[],
  ) => Promise<ConnectorsLaunch | null> = () => Promise.resolve(null)

  constructor(private readonly runtimes: () => Iterable<ConversationRuntime>) {}

  /** Набор коннекторов поменялся в проектах, для которых affects - да. */
  serversChanged(affects: (projectPath: string) => boolean): void {
    for (const runtime of this.runtimes()) {
      if (claudeOf(runtime).process?.isAlive && affects(runtime.meta.projectPath))
        runtime.restartSession()
    }
  }

  serverChanged(serverName: string): void {
    for (const runtime of this.runtimes()) {
      // Процесс поднят раньше, чем появился сервер, - CLI ответит отказом: сервер придёт
      // с перезапуском, который уже назначен.
      void claudeOf(runtime)
        .process?.control({ subtype: 'mcp_reconnect', serverName })
        .catch(() => undefined)
    }
  }
}
