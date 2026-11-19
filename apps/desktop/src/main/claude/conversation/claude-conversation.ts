import type { ModelInfo, SlashCommand } from '@shared/conversation'
import type { FeedPatch } from '@shared/conversation-feed'

import { TurnRevert } from '../changes/turn-revert'
import type { ClaudeCli } from '../cli/cli-locator'
import type { CliTap } from '../cli/cli-messages'
import type { CliProcess } from '../cli/cli-process'
import type { AgentFeed, AgentHost } from '../../agents/conversation/agent-parts'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { ShellRuns } from '../../agents/shell/shell-runs'
import type { ClaudeSession } from './claude-session'
import type { ConnectorsLaunch } from './connectors-launch'
import { ConversationFeedSync } from './conversation-feed'

/**
 * Что драйверу Claude нужно от сервиса панели сверх общего (ADR 0083): CLI выбранного
 * аккаунта, рассылка ленты, каталоги, расход, коннекторы в формате CLI и служебное панели.
 */
export type ClaudeHost = AgentHost &
  CliTap & {
    cli: () => Promise<ClaudeCli | null>
    onFeedPatch: (patch: FeedPatch) => void
    onModels: (models: ModelInfo[]) => void
    knownCommands: (projectPath: string) => SlashCommand[]
    /** Ход кончился или CLI сказал о лимите: процесс знает свежий расход аккаунта. */
    onUsageHint: (runtime: ConversationRuntime) => void
    /**
     * Конфиг коннекторов IDE для нового процесса в проекте (ADR 0029); коннекторов нет -
     * null. Не записался - отказ: процесс поднимется без них.
     */
    mcpConfig: (projectPath: string) => Promise<ConnectorsLaunch | null>
  }

/**
 * Своё Claude у разговора ядра: лента со сборщиком потока CLI, откат файлов по транскрипту,
 * команды `!` и то, что знает только протокол `claude -p` (рукопожатие свежего процесса,
 * uuid сообщения хода, имя от модели, откат). Ядро о нём не знает: модули Claude берут его
 * через claudeOf.
 */
export class ClaudeConversation {
  readonly feed: ConversationFeedSync
  /** Откат файлов последнего хода; конец хода запоминает process-router. */
  readonly turnRevert: TurnRevert
  readonly shells: ShellRuns
  /** CLI последнего процесса: возможности его версии (режимы, флаги). */
  cli: ClaudeCli | null = null
  /**
   * Процесс только поднят: его первый пустой `result` (после --resume), не привязанный к
   * нашему сообщению, - не ход (turn-command.ts). Снимается, как только CLI взял сообщение.
   */
  freshProcess = false
  /**
   * uuid нашего сообщения, которым начался идущий ход: по отметкам CLI о нём видно, кончился
   * ли ход (turn-command.ts). null - ход начал сам CLI.
   */
  turnCommand: string | null = null
  /** Ждём от CLI имя вкладки (conversation/session-title.ts): второй раз не спрашиваем. */
  titleAsking = false
  /** Счёт /clear: имя, пришедшее после него, было о прежнем разговоре. */
  titleEpoch = 0
  /** Имя от человека, которое уже получил этот процесс (tabs/tab-rename.ts). */
  namedAs: string | null = null
  /** Имя последнего сообщения, ушедшего в CLI: откат говорит его как последнее увиденное. */
  lastSentUuid: string | null = null
  /**
   * Ход отрезан откатом: CLI про него молчит, а то, что всё же пришло (поздний `result`,
   * хвост ответа), - лишнее. Снимается следующим сообщением человека.
   */
  discardStray = false
  /** Последняя поднятая сессия; живая, пока ядро держит её своей (runtime.session). */
  session: ClaudeSession | null = null

  constructor(
    readonly runtime: ConversationRuntime,
    readonly host: ClaudeHost,
  ) {
    this.feed = new ConversationFeedSync(runtime.meta.id, host.onFeedPatch, host.thumbnail)
    this.shells = new ShellRuns(this.feed)
    this.turnRevert = new TurnRevert(runtime, this.feed)
  }

  /** Процесс живой сессии разговора; null - сессии нет или она уже заменена. */
  get process(): CliProcess | null {
    const { session } = this

    return session && this.runtime.session === session ? session.process : null
  }

  /** Лента для ядра: прошлые ходы - из своего транскрипта, у нерождённого форка - из источника. */
  coreFeed(): AgentFeed {
    const { feed, runtime } = this

    return {
      builder: feed.builder,
      ensureLoaded: () =>
        feed.ensureLoaded(runtime.meta.projectPath, runtime.meta.sessionId, runtime.meta.fork),
      snapshot: () => feed.snapshot(),
      loadEarlier: () => feed.loadEarlier(),
      loadThrough: (itemId) => feed.loadThrough(itemId),
      itemsById: (itemIds) => feed.itemsById(itemIds),
      schedule: () => feed.schedule(),
      flush: () => feed.flush(),
      dispose: () => feed.dispose(),
    }
  }
}

const kits = new WeakMap<ConversationRuntime, ClaudeConversation>()

/** Завести своё Claude разговору - зовёт драйвер, когда ядро собирает разговор. */
export const attachClaude = (
  runtime: ConversationRuntime,
  host: ClaudeHost,
): ClaudeConversation => {
  const kit = new ClaudeConversation(runtime, host)

  kits.set(runtime, kit)

  return kit
}

/** Своё Claude разговора; разговор не Claude - ошибка, а не тихий пропуск. */
export const claudeOf = (runtime: ConversationRuntime): ClaudeConversation => {
  const kit = kits.get(runtime)

  if (!kit) throw new Error(`Разговор ${runtime.meta.id} - не разговор Claude`)

  return kit
}
