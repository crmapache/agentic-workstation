import type { ConversationRuntime } from '../agents/conversation/conversation-runtime'
import type { GatewayLaunch } from '../connectors/gateway/launches'
import { codexOf } from './conversation/codex-conversation'

/**
 * Коннекторы IDE для процессов разговоров Codex (ADR 0028, 0029), как ConnectorsBridge у
 * Claude: серверы шлюза процесс получает флагами при запуске, поэтому новый, удалённый или
 * включённый в проекте коннектор перезапускает процессы этих проектов, как освободятся; то,
 * что поменялось внутри сервера (вход, выключенный инструмент), живой процесс подхватывает
 * переподключением серверов (`config/mcpServer/reload`), без перезапуска.
 */
export class CodexConnectorsBridge {
  /**
   * Ключ шлюза (без файла: Codex берёт его из окружения) и серверы для нового процесса в
   * проекте; null - коннекторов нет. Ставит index.ts.
   */
  configFor: (projectPath: string, ideServers?: readonly string[]) => GatewayLaunch | null = () =>
    null

  constructor(private readonly runtimes: () => Iterable<ConversationRuntime>) {}

  serversChanged(affects: (projectPath: string) => boolean): void {
    for (const runtime of this.runtimes()) {
      if (codexOf(runtime).live && affects(runtime.meta.projectPath)) runtime.restartSession()
    }
  }

  serverChanged(): void {
    for (const runtime of this.runtimes()) {
      void codexOf(runtime)
        .live?.server.request('config/mcpServer/reload', {})
        .catch(() => undefined)
    }
  }
}
