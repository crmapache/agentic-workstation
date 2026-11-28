import type { SlashCommand } from '@shared/conversation'
import type { FeedItem, FeedPatch } from '@shared/conversation-feed'

import type { AcpCli, AcpAgent } from '../acp-agent'
import type { AcpMcpServer, AcpSessionSetup } from '../protocol/acp-types'
import type { AgentHost } from '../../agents/conversation/agent-parts'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { ShellRuns } from '../../agents/shell/shell-runs'
import type { GatewayLaunch } from '../../connectors/gateway/launches'
import { AcpFeedSync } from './acp-feed'
import type { AcpSession } from './acp-session'

/** Коннекторы IDE процесса разговора: серверы шлюза и ключ процесса. */
export type AcpConnectors = { servers: AcpMcpServer[]; launch: GatewayLaunch | null }

/** Что драйверу ACP нужно от сервиса панели сверх общего (ADR 0083, 0092). */
export type AcpHost = AgentHost & {
  readonly agent: AcpAgent
  cli: () => Promise<AcpCli | null>
  onFeedPatch: (patch: FeedPatch) => void
  /** Коннекторы IDE для процесса в проекте (ADR 0029). */
  connectors: (projectPath: string) => AcpConnectors
  /** Повтор прошлого разговора для ленты - процессом-каталогом; null - не прочитать. */
  replay: (sessionId: string, projectPath: string) => Promise<FeedItem[] | null>
  /** Агент рассказал о сессии (настройки, тариф): меню и аккаунт панели. */
  onSetup: (setup: AcpSessionSetup) => void
  /** Агент отказал: в него не вошли. */
  onSignedOut: () => void
  /** Команды «/» агента для проекта. */
  onAgentCommands: (projectPath: string, commands: SlashCommand[]) => void
  /** Указания IDE к каждому разговору: правила IDE о коннекторах и прочем; пусто - нет. */
  instructions: (projectPath: string) => string
  version: string
}

/**
 * Своё ACP у разговора ядра: лента со сборщиком ACP, команды `!` и последняя сессия. Ядро о нём
 * не знает: модули ACP берут его через acpOf.
 */
export class AcpConversation {
  readonly feed: AcpFeedSync
  readonly shells: ShellRuns
  /** Последняя поднятая сессия; живая, пока ядро держит её своей (runtime.session). */
  session: AcpSession | null = null
  /** Имена серверов MCP процесса - для вида действия вызовов коннекторов. */
  servers: readonly string[] = []
  /**
   * Правила «разрешено всегда» шлюза (`mcp__<сервер>` или `mcp__<сервер>__<инструмент>`):
   * уведомления самому себе и чтение IDE (ADR 0069, 0090) - без вопроса человеку.
   */
  allowed: readonly string[] = []
  /** Имя разговора уже спрашивается у агента (acp-title.ts): второй вопрос не нужен. */
  titleAsking = false

  constructor(
    readonly runtime: ConversationRuntime,
    readonly host: AcpHost,
  ) {
    this.feed = new AcpFeedSync(
      runtime.meta.id,
      host.onFeedPatch,
      host.thumbnail,
      host.agent,
      () => this.servers,
      () =>
        runtime.meta.sessionId
          ? host.replay(runtime.meta.sessionId, runtime.meta.projectPath)
          : null,
      () => runtime.meta.fork,
    )
    this.shells = new ShellRuns(this.feed)
  }

  /** Живая сессия разговора; null - сессии нет или она уже заменена. */
  get live(): AcpSession | null {
    const { session } = this

    return session && this.runtime.session === session ? session : null
  }
}

const kits = new WeakMap<ConversationRuntime, AcpConversation>()

/** Завести своё ACP разговору - зовёт драйвер, когда ядро собирает разговор. */
export const attachAcp = (runtime: ConversationRuntime, host: AcpHost): AcpConversation => {
  const kit = new AcpConversation(runtime, host)

  kits.set(runtime, kit)

  return kit
}

/** Своё ACP разговора; разговор не ACP - ошибка, а не тихий пропуск. */
export const acpOf = (runtime: ConversationRuntime): AcpConversation => {
  const kit = kits.get(runtime)

  if (!kit) throw new Error(`Разговор ${runtime.meta.id} - не разговор ACP`)

  return kit
}
