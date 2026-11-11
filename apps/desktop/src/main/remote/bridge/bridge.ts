import type { ClaudeState } from '@shared/claude'
import type { FeedPatch } from '@shared/claude-feed'
import type { ProviderInfo } from '@shared/providers'
import type { ScenarioRun } from '@shared/scenario-runs'

import type { AgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { parseCommand } from '@agentic-workstation/remote-protocol/commands'
import type { CmdMessage, PhoneMessage } from '@agentic-workstation/remote-protocol/phone-messages'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'

import type { BridgePorts } from './bridge-ports'
import type { Outcome } from './command-desk'
import { CommandDesk } from './command-desk'
import { StatusClock } from './conversation-wire'
import { FeedDesk } from './feed-desk'
import { fitValue } from './fit'
import { inventoryOf, inventoryPrint } from './inventory'
import { ProjectKeys } from './project-keys'
import { WatchDesk } from './watch-desk'

/** Начало хода, вопрос и ответ приходят за миллисекунды - список шлётся один раз. */
const INVENTORY_DEBOUNCE_MS = 300

/** Вид для предела частоты у команд не из белого списка или с кривыми аргументами. */
const REFUSED_KIND = 'cmd.refused'

export type BridgeHost = {
  ports: BridgePorts
  send: (deviceId: string, message: AgentMessage) => void
  /** Телефоны на связи: им - новый список, когда он поменялся. */
  onTheLine: () => Set<string>
  /** Предел частоты по виду просьбы (у команд - их имя). */
  allow: (deviceId: string, kind: string) => boolean
  machine: () => { label: string; ideVersion: string }
  /** Жизнь этой линии: номера журналов лент - внутри неё. */
  epoch: string
}

/**
 * Мост Remote Control к IDE: инвентарь машины, подписки (лента и состояние разговора, прогон,
 * очереди), команды телефона. Просьбы одного телефона выполняются строго по очереди: «новый
 * разговор» и следом «смотри его» наперегонки нашли бы разговор, которого ещё нет.
 */
export class Bridge {
  readonly feeds: FeedDesk
  private readonly watches: WatchDesk
  private readonly commands: CommandDesk
  private readonly clock = new StatusClock()
  private readonly chains = new Map<string, Promise<void>>()
  private keysCache: ProjectKeys | null = null
  private providers: ProviderInfo[] = []
  private inventoryTimer: NodeJS.Timeout | null = null
  private sentInventory = ''

  constructor(private readonly host: BridgeHost) {
    const { ports } = host

    this.feeds = new FeedDesk({
      getFeed: ports.conversations.getFeed,
      send: host.send,
      epoch: host.epoch,
    })
    this.watches = new WatchDesk({
      send: host.send,
      conversations: () => ports.conversations.getState().conversations,
      keys: () => this.keys(),
      clock: this.clock,
      queuesView: ports.scenarios.queuesView,
      run: ports.scenarios.run,
    })
    this.commands = new CommandDesk(ports, () => this.keys())
  }

  /** Открытое и проверенное слово спаренного телефона. */
  handle(deviceId: string, message: PhoneMessage): void {
    this.inOrder(deviceId, () => this.act(deviceId, message))
  }

  claudeChanged(state: ClaudeState): void {
    const alive = new Set(state.conversations.map((conversation) => conversation.id))

    this.clock.keep(alive)

    for (const [deviceId, conversationId] of this.feeds.watchers()) {
      if (!alive.has(conversationId)) this.feeds.forget(conversationId)
      if (!this.watches.conversation(deviceId, conversationId)) this.feeds.unwatch(deviceId)
    }

    this.scheduleInventory()
  }

  feedPatched(patch: FeedPatch): void {
    this.feeds.patched(patch)
  }

  queuesChanged(): void {
    this.keysCache = null
    this.watches.queuesChanged()
    this.scheduleInventory()
  }

  runChanged(run: ScenarioRun): void {
    this.watches.runChanged(run)
  }

  /** Открыли или закрыли проект: ключи другие, разговоры закрытого телефону больше не видны. */
  workspaceChanged(): void {
    this.keysCache = null

    for (const [deviceId, conversationId] of this.feeds.watchers()) {
      if (!this.watches.conversation(deviceId, conversationId)) this.feeds.unwatch(deviceId)
    }

    this.watches.queuesChanged()
    this.scheduleInventory()
  }

  /** Новые ключи у телефона или обвал очереди: всё посланное ему - как не посланное. */
  startedAgain(deviceId: string): void {
    this.watches.forgetPrints(deviceId)
  }

  forget(deviceId: string): void {
    this.feeds.unwatch(deviceId)
    this.watches.forget(deviceId)
    this.chains.delete(deviceId)
  }

  stop(): void {
    this.feeds.stop()

    if (this.inventoryTimer) clearTimeout(this.inventoryTimer)

    this.inventoryTimer = null
  }

  private async act(deviceId: string, message: PhoneMessage): Promise<void> {
    switch (message.k) {
      case 'hello':
      case 'inventory':
        this.providers = await this.host.ports.conversations.providers()

        return this.sendInventory([deviceId])
      case 'subscribe':
        if (message.conversationId) {
          // Разговора нет (вкладку закрыли, проект закрыт) - телефону уже сказано conversationGone.
          if (!this.watches.conversation(deviceId, message.conversationId)) return

          return this.feeds.watch(deviceId, message.conversationId, message.since, message.epoch)
        }

        if (message.runId && !(await this.watches.watchRun(deviceId, message.runId))) {
          return this.notFound(deviceId, message.runId)
        }

        if (message.projectKey) this.watches.watchQueues(deviceId, message.projectKey)

        return
      case 'unsubscribe':
        if (message.conversationId) this.feeds.unwatch(deviceId)
        if (message.runId) this.watches.unwatchRun(deviceId)
        if (message.projectKey) this.watches.unwatchQueues(deviceId)

        return
      case 'cmd':
        return this.command(deviceId, message)
      case 'ping':
      case 'part':
        return
    }
  }

  private async command(deviceId: string, message: CmdMessage) {
    const reply = (outcome: Outcome) =>
      this.host.send(deviceId, { p: PROTOCOL_VERSION, k: 'result', id: message.id, ...outcome })
    const parsed = parseCommand(message.name, message.args)
    // Отказы считаются одной кучей и строго: поток незнакомых команд - не человек печатает.
    const kind = parsed.ok ? parsed.command.name : REFUSED_KIND

    if (!this.host.allow(deviceId, kind)) return reply({ ok: false, code: 'rateLimited' })
    if (!parsed.ok) return reply({ ok: false, code: parsed.code })

    try {
      reply(await this.commands.run(parsed.command))
    } catch (error) {
      console.warn(`[remote] команда телефона ${parsed.command.name} не выполнилась:`, error)
      reply({ ok: false, code: 'failed' })
    }
  }

  private notFound(deviceId: string, about: string) {
    this.host.send(deviceId, {
      p: PROTOCOL_VERSION,
      k: 'notice',
      level: 'warning',
      code: 'notFound',
      about,
    })
  }

  private inOrder(deviceId: string, work: () => Promise<void> | void) {
    const next = (this.chains.get(deviceId) ?? Promise.resolve())
      .then(work)
      .catch((error: unknown) => console.warn('[remote] просьба телефона не выполнилась:', error))

    this.chains.set(deviceId, next)
  }

  private keys(): ProjectKeys {
    this.keysCache ??= new ProjectKeys(
      this.host.ports.workspace.getState(),
      this.host.ports.scenarios.queuesView().queues.map((queue) => queue.projectPath),
    )

    return this.keysCache
  }

  /** Список - каждому на связи, если он поменялся: телефон, не смотрящий разговор, узнает, что тот заработал. */
  private scheduleInventory() {
    if (this.inventoryTimer) return

    this.inventoryTimer = setTimeout(() => {
      this.inventoryTimer = null
      this.sendInventory([...this.host.onTheLine()], true)
    }, INVENTORY_DEBOUNCE_MS)
    this.inventoryTimer.unref()
  }

  private sendInventory(deviceIds: string[], onlyChanged = false) {
    const { ports } = this.host
    const inventory = inventoryOf({
      workspace: ports.workspace.getState(),
      claude: ports.conversations.getState(),
      queues: ports.scenarios.queuesView(),
      providers: this.providers,
      keys: this.keys(),
      clock: this.clock,
      machine: this.host.machine(),
      epoch: this.host.epoch,
      now: Date.now(),
    })
    const print = inventoryPrint(inventory)
    const fitted = fitValue(inventory)

    if (!fitted || (onlyChanged && print === this.sentInventory)) return

    this.sentInventory = print

    for (const deviceId of deviceIds) this.host.send(deviceId, fitted)
  }
}
