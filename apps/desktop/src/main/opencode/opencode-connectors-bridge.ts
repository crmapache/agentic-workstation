import type { ConversationRuntime } from '../agents/conversation/conversation-runtime'
import type { GatewayLaunch } from '../connectors/gateway/launches'
import { openCodeOf } from './conversation/opencode-conversation'

/**
 * Коннекторы IDE для процессов разговоров OpenCode (ADR 0028, 0029), как у Codex: серверы
 * шлюза процесс получает конфигом при запуске, ключ - в нём же, на диск он не ложится. Новый,
 * удалённый или включённый в проекте коннектор, как и перемена внутри сервера, перезапускает
 * процессы этих проектов, как освободятся: переподключать MCP на лету OpenCode умеет только
 * экспериментальными путями.
 */
export class OpenCodeConnectorsBridge {
  /** Ключ шлюза и серверы для нового процесса в проекте; null - коннекторов нет. Ставит index.ts. */
  configFor: (projectPath: string, ideServers?: readonly string[]) => GatewayLaunch | null = () =>
    null

  constructor(private readonly runtimes: () => Iterable<ConversationRuntime>) {}

  serversChanged(affects: (projectPath: string) => boolean): void {
    for (const runtime of this.runtimes()) {
      if (openCodeOf(runtime).live && affects(runtime.meta.projectPath)) runtime.restartSession()
    }
  }

  serverChanged(): void {
    this.serversChanged(() => true)
  }
}
