import type { EffortLevel } from '@shared/conversation'
import type { FeedPatch } from '@shared/conversation-feed'

import type { OpenCodeCli } from '../cli/opencode-locator'
import type { OpenCodeDirs } from '../server/opencode-server'
import type { AgentHost } from '../../agents/conversation/agent-parts'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { ShellRuns } from '../../agents/shell/shell-runs'
import type { GatewayLaunch } from '../../connectors/gateway/launches'
import type { OpenCodeHistory } from './opencode-feed'
import { OpenCodeFeedSync } from './opencode-feed'
import type { OpenCodeSession } from './opencode-session'

/** Что нужно процессу OpenCode в проекте: конфиг строкой и ключ шлюза коннекторов IDE. */
export type OpenCodeLaunch = {
  config: string
  connectors: GatewayLaunch | null
  /** Имена серверов MCP коннекторов: по ним вызов MCP отличается от прочих инструментов. */
  servers: readonly string[]
  /** Действия, разрешённые всегда (уведомления самому себе, ADR 0069): `<сервер>_*`. */
  allowedActions: readonly string[]
  /** Переменные процесса сверх окружения человека (opencode-instructions.ts). */
  env: Record<string, string>
  /** Процесс поднят с компактными указаниями - для модели с маленьким окном (ADR 0089). */
  compact: boolean
  /** Процесс кончился: его ключ у прокси моделей больше не годится. */
  release: () => void
}

/** Что драйверу OpenCode нужно от сервиса панели сверх общего (ADR 0083, 0084). */
export type OpenCodeHost = AgentHost & {
  cli: () => Promise<OpenCodeCli | null>
  onFeedPatch: (patch: FeedPatch) => void
  /** Свои папки OpenCode у IDE: конфиг, база разговоров, состояние, кеш. */
  dirs: () => OpenCodeDirs
  /**
   * Конфиг и коннекторы для нового процесса в проекте; model - модель разговора (нет - по
   * умолчанию панели): модель Ollama к запуску готовится.
   */
  launch: (projectPath: string, model: string | null) => Promise<OpenCodeLaunch>
  /** Модель «по умолчанию» панели (`<подключение>/<модель>`); null - моделей нет. */
  defaultModel: () => string | null
  /** Окно контекста модели панели; 0 - не знаем. */
  contextWindow: (model: string) => number
  /** Страница журнала сессии - процессом-каталогом. */
  messages: OpenCodeHistory['messages']
  /** Уровни усилия модели панели (варианты OpenCode); пусто - у модели их нет. */
  efforts: (model: string) => readonly EffortLevel[]
}

/**
 * Своё OpenCode у разговора ядра: лента со сборщиком OpenCode, команды `!` и последняя
 * сессия. Ядро о нём не знает: модули OpenCode берут его через openCodeOf.
 */
export class OpenCodeConversation {
  readonly feed: OpenCodeFeedSync
  readonly shells: ShellRuns
  /** Последняя поднятая сессия; живая, пока ядро держит её своей (runtime.session). */
  session: OpenCodeSession | null = null
  /** Имена серверов MCP процесса - для вида действия вызовов. */
  servers: readonly string[] = []
  /** Действия процесса, о которых человека не спрашивают (свои серверы IDE). */
  allowedActions: readonly string[] = []
  /** Процесс поднят с компактными указаниями (ADR 0089); null - процесса ещё не было. */
  compact: boolean | null = null
  /**
   * Действия, разрешённые человеком «для этого разговора» (Allow for this chat). Живут с
   * разговором, а не с процессом: сон и перезапуск процесса их не стирают.
   */
  readonly allowedHere = new Set<string>()

  constructor(
    readonly runtime: ConversationRuntime,
    readonly host: OpenCodeHost,
  ) {
    this.feed = new OpenCodeFeedSync(
      runtime.meta.id,
      host.onFeedPatch,
      host.thumbnail,
      () => ({ servers: this.servers, root: runtime.meta.projectPath }),
      {
        sessionId: () => runtime.meta.sessionId,
        messages: host.messages,
        fork: () => runtime.meta.fork,
      },
    )
    this.shells = new ShellRuns(this.feed)
  }

  /** Живая сессия разговора; null - сессии нет или она уже заменена. */
  get live(): OpenCodeSession | null {
    const { session } = this

    return session && this.runtime.session === session ? session : null
  }
}

const kits = new WeakMap<ConversationRuntime, OpenCodeConversation>()

/** Завести своё OpenCode разговору - зовёт драйвер, когда ядро собирает разговор. */
export const attachOpenCode = (
  runtime: ConversationRuntime,
  host: OpenCodeHost,
): OpenCodeConversation => {
  const kit = new OpenCodeConversation(runtime, host)

  kits.set(runtime, kit)

  return kit
}

/** Своё OpenCode разговора; разговор не OpenCode - ошибка, а не тихий пропуск. */
export const openCodeOf = (runtime: ConversationRuntime): OpenCodeConversation => {
  const kit = kits.get(runtime)

  if (!kit) throw new Error(`Разговор ${runtime.meta.id} - не разговор OpenCode`)

  return kit
}
