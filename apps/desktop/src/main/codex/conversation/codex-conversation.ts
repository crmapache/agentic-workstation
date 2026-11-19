import type { ModelInfo } from '@shared/conversation'
import type { FeedPatch } from '@shared/conversation-feed'

import type { CodexCli } from '../cli/codex-locator'
import type { AgentHost } from '../../agents/conversation/agent-parts'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { ShellRuns } from '../../agents/shell/shell-runs'
import type { GatewayLaunch } from '../../connectors/gateway/launches'
import type { UserServer } from './codex-connectors'
import type { CodexHistory } from './codex-feed'
import { CodexFeedSync } from './codex-feed'
import type { CodexSession } from './codex-session'

/** Что драйверу Codex нужно от сервиса панели сверх общего (ADR 0083). */
export type CodexHost = AgentHost & {
  /** Codex выбранного аккаунта: окружение с его CODEX_HOME. */
  cli: () => Promise<CodexCli | null>
  onFeedPatch: (patch: FeedPatch) => void
  /** Версия IDE - для рукопожатия app-server. */
  version: () => string
  /** Модель каталога по id; без id - модель каталога по умолчанию; каталога нет - null. */
  model: (id: string | null) => ModelInfo | null
  /** Страница прошлых ходов потока, свежие первыми (процесс-каталог). */
  turns: CodexHistory['turns']
  /** Лимиты поменялись по ходу работы (`account/rateLimits/updated`). */
  onUsageChanged: () => void
  /** Коннекторы IDE для нового процесса в проекте; null - их нет или шлюз не поднялся. */
  connectors: (projectPath: string) => GatewayLaunch | null
  /** Свои MCP-серверы человека из конфига Codex - их процессы IDE выключают. */
  userMcpServers: () => Promise<readonly UserServer[]>
}

/**
 * Своё Codex у разговора ядра: лента со сборщиком Codex, команды `!` и последняя сессия.
 * Ядро о нём не знает: модули Codex берут его через codexOf.
 */
export class CodexConversation {
  readonly feed: CodexFeedSync
  readonly shells: ShellRuns
  /** Последняя поднятая сессия; живая, пока ядро держит её своей (runtime.session). */
  session: CodexSession | null = null
  /**
   * Причина, по которой быстрый режим не включился, уже сказанная строкой FAST: та же - не
   * повторяется, пока режим не заработает или его не попросят снова (codex-fast.ts).
   */
  fastNoted = ''

  constructor(
    readonly runtime: ConversationRuntime,
    readonly host: CodexHost,
  ) {
    this.feed = new CodexFeedSync(runtime.meta.id, host.onFeedPatch, host.thumbnail, {
      threadId: () => runtime.meta.sessionId,
      turns: host.turns,
      fork: () => runtime.meta.fork,
    })
    this.shells = new ShellRuns(this.feed)
  }

  /** Живая сессия разговора; null - сессии нет или она уже заменена. */
  get live(): CodexSession | null {
    const { session } = this

    return session && this.runtime.session === session ? session : null
  }
}

const kits = new WeakMap<ConversationRuntime, CodexConversation>()

/** Завести своё Codex разговору - зовёт драйвер, когда ядро собирает разговор. */
export const attachCodex = (runtime: ConversationRuntime, host: CodexHost): CodexConversation => {
  const kit = new CodexConversation(runtime, host)

  kits.set(runtime, kit)

  return kit
}

/** Своё Codex разговора; разговор не Codex - ошибка, а не тихий пропуск. */
export const codexOf = (runtime: ConversationRuntime): CodexConversation => {
  const kit = kits.get(runtime)

  if (!kit) throw new Error(`Разговор ${runtime.meta.id} - не разговор Codex`)

  return kit
}
