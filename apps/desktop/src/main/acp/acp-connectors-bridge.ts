import type { ConversationRuntime } from '../agents/conversation/conversation-runtime'
import type { GatewayLaunch } from '../connectors/gateway/launches'
import { onlyServers } from '../opencode/connections/only-servers'
import type { AcpConnectors } from './conversation/acp-conversation'
import { acpOf } from './conversation/acp-conversation'

/**
 * Коннекторы IDE для процессов разговоров ACP (ADR 0029, 0092), как у Codex и OpenCode: серверы
 * шлюза агент получает в `session/new` (MCP по HTTP, ключ процесса - в заголовке), на диск ключ
 * не ложится. Свои MCP человека у агента не появляются: у IDE своя папка агента. Новый,
 * удалённый или включённый в проекте коннектор, как и перемена внутри сервера, перезапускает
 * процессы этих проектов, как освободятся: переподключать MCP посреди сессии ACP не умеет.
 */
export class AcpConnectorsBridge {
  /** Ключ шлюза и серверы для нового процесса в проекте; null - коннекторов нет. Ставит index.ts. */
  configFor: (projectPath: string, ideServers?: readonly string[]) => GatewayLaunch | null = () =>
    null

  constructor(private readonly runtimes: () => Iterable<ConversationRuntime>) {}

  /**
   * Серверы шлюза словами ACP: HTTP с ключом процесса в заголовке. ideServers - свои серверы IDE
   * только этому процессу (инструменты поручения у прогона, ADR 0080); only - только эти серверы
   * (разовому вопросу - те, чьи инструменты ему разрешены), нет - все серверы проекта.
   */
  serversFor(
    projectPath: string,
    ideServers: readonly string[] = [],
    only?: readonly string[],
  ): AcpConnectors {
    const launch = onlyServers(this.configFor(projectPath, ideServers), only)

    return {
      launch,
      servers: (launch?.servers ?? []).map((entry) => ({
        type: 'http' as const,
        name: entry.name,
        url: entry.url,
        headers: [{ name: 'Authorization', value: `Bearer ${launch?.token ?? ''}` }],
      })),
    }
  }

  serversChanged(affects: (projectPath: string) => boolean): void {
    for (const runtime of this.runtimes()) {
      if (acpOf(runtime).live && affects(runtime.meta.projectPath)) runtime.restartSession()
    }
  }

  serverChanged(): void {
    this.serversChanged(() => true)
  }
}
