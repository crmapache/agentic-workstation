import type { ClaudeState } from '@shared/claude'
import type { FeedPatch } from '@shared/claude-feed'
import type { ScenarioRun } from '@shared/scenario-runs'

import type { AgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { parseCommand } from '@agentic-workstation/remote-protocol/commands'
import type {
  CmdMessage,
  PhoneMessage,
  SubscribeMessage,
  UnsubscribeMessage,
} from '@agentic-workstation/remote-protocol/phone-messages'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'

import type { Lane } from '../link/outbox'
import type { BridgePorts } from './bridge-ports'
import { CommandDesk } from './command-desk'
import type { Outcome } from './command-ledger'
import { CommandLedger } from './command-ledger'
import { StatusClock } from './conversation-wire'
import { FeedDesk } from './feed-desk'
import type { Redact } from './fit'
import { InventoryDesk } from './inventory-desk'
import { PhoneChains } from './phone-chain'
import { ProjectKeys } from './project-keys'
import { machineRoots, pathRedactor } from './redact'
import { WatchDesk } from './watch-desk'

export type BridgeHost = {
  ports: BridgePorts
  /** false - не ушло в очередь (ключей нет, тело не влезло). */
  send: (deviceId: string, message: AgentMessage, lane?: Lane) => boolean
  /** Телефоны на связи: им - новый список, когда он поменялся. */
  onTheLine: () => Set<string>
  /** Телефон на связи: спящему лента и состояние не шлются, он догонит, проснувшись. */
  awake: (deviceId: string) => boolean
  /** Телефон спарен и с ключами: отпущенному ничего не выполняется. */
  known: (deviceId: string) => boolean
  machine: () => { label: string; ideVersion: string }
  /** Домашняя папка: в тексте для телефона она - «~». */
  home: string
  /** Жизнь этой линии: номера журналов лент - внутри неё. */
  epoch: string
}

/** Ключи проектов и подмена папок - по одному состоянию IDE, пересчитываются вместе. */
type Lens = { keys: ProjectKeys; redact: Redact }

/**
 * Мост Remote Control к IDE: инвентарь машины, подписки (лента и состояние разговора, прогон,
 * очереди), команды телефона. Подписки одного телефона - строго по очереди; команда в очереди
 * только начинается, а её итог уходит, когда готов: долгий запуск сценария не держит «стоп».
 */
export class Bridge {
  readonly feeds: FeedDesk
  private readonly watches: WatchDesk
  private readonly commands: CommandDesk
  private readonly inventory: InventoryDesk
  private readonly ledger = new CommandLedger()
  private readonly chains: PhoneChains
  private readonly clock = new StatusClock()
  private lensCache: Lens | null = null

  constructor(private readonly host: BridgeHost) {
    const { ports } = host
    const redact = () => this.lens().redact
    const keys = () => this.lens().keys

    this.chains = new PhoneChains(host.known)
    this.feeds = new FeedDesk({
      getFeed: (conversationId) => ports.conversations.getFeed(conversationId),
      send: (deviceId, message) => host.send(deviceId, message),
      awake: host.awake,
      redact,
      epoch: host.epoch,
    })
    this.watches = new WatchDesk({
      send: (deviceId, message) => host.send(deviceId, message),
      awake: host.awake,
      conversations: () => ports.conversations.getState().conversations,
      keys,
      redact,
      clock: this.clock,
      queuesView: () => ports.scenarios.queuesView(),
      run: (projectPath, runId) => ports.scenarios.run(projectPath, runId),
    })
    this.inventory = new InventoryDesk({
      ports,
      send: (deviceId, message) => host.send(deviceId, message),
      onTheLine: host.onTheLine,
      keys,
      redact,
      clock: this.clock,
      machine: host.machine,
      epoch: host.epoch,
    })
    this.commands = new CommandDesk(ports, keys)
  }

  /** Открытое и проверенное слово спаренного телефона (предел частоты уже позади). */
  handle(deviceId: string, message: PhoneMessage): void {
    switch (message.k) {
      case 'hello':
      case 'inventory':
        return void this.inventory.answer(deviceId, this.chains.ticket(deviceId))
      case 'cmd':
        return this.command(deviceId, message)
      case 'subscribe':
        return this.chains.run(deviceId, () => this.subscribe(deviceId, message))
      case 'unsubscribe':
        return this.chains.run(deviceId, () => this.unsubscribe(deviceId, message))
      // Стук, «забудь меня» и куски решает агент (agent/inbound.ts): сюда они не доходят.
      case 'ping':
      case 'unpair':
      case 'part':
        return
    }
  }

  /** Команда с этим id уже принята: её повтор - доставка, а не новая просьба. */
  knows(deviceId: string, commandId: string): boolean {
    return this.ledger.seen(deviceId, commandId) !== null
  }

  claudeChanged(state: ClaudeState): void {
    const alive = new Set(state.conversations.map((conversation) => conversation.id))

    this.clock.keep(alive)

    for (const [deviceId, conversationId] of this.feeds.watchers()) {
      if (!alive.has(conversationId)) this.feeds.forget(conversationId)
      if (!this.watches.conversation(deviceId, conversationId)) this.feeds.unwatch(deviceId)
    }

    this.inventory.schedule()
  }

  feedPatched(patch: FeedPatch): void {
    this.feeds.patched(patch)
  }

  queuesChanged(): void {
    this.lensCache = null
    this.watches.queuesChanged()
    this.inventory.schedule()
  }

  runChanged(run: ScenarioRun): void {
    this.watches.runChanged(run)
  }

  /** Открыли или закрыли проект: ключи другие, разговоры закрытого телефону больше не видны. */
  workspaceChanged(): void {
    this.lensCache = null

    for (const [deviceId, conversationId] of this.feeds.watchers()) {
      if (!this.watches.conversation(deviceId, conversationId)) this.feeds.unwatch(deviceId)
    }

    this.watches.queuesChanged()
    this.inventory.schedule()
  }

  /**
   * Новые ключи телефона - новая страница или вторая вкладка: подписки прежней ей не нужны и
   * шли бы ей зря. Снимаются в очереди - после всего, что прежняя страница успела попросить.
   */
  newKeys(deviceId: string): void {
    this.chains.run(deviceId, () => {
      this.feeds.unwatch(deviceId)
      this.watches.forget(deviceId)
      this.inventory.forget(deviceId)
    })
  }

  /** Очередь до телефона обвалилась: всё посланное ему - как не посланное, список - заново. */
  resend(deviceId: string): void {
    this.watches.forgetPrints(deviceId)
    this.inventory.forget(deviceId)
    this.inventory.schedule()
  }

  /** Телефон проснулся: что поменялось, пока он спал, - лента из журнала, состояние, список. */
  woke(deviceId: string): void {
    this.chains.run(deviceId, async () => {
      const conversationId = this.feeds.watching(deviceId)

      if (conversationId && !this.watches.conversation(deviceId, conversationId)) {
        this.feeds.unwatch(deviceId)
      }

      this.watches.catchUp(deviceId)
      this.inventory.catchUp(deviceId)
      await this.feeds.catchUp(deviceId)
    })
  }

  /**
   * Линия до релея поднялась снова (ноутбук проснулся): посланное в умерший сокет могло не
   * дойти. Отпечатки всех телефонов - заново, тем, кто на связи, - «переспроси со своего
   * номера» и список машины; спящие догонят, когда проснутся.
   */
  linkUp(): void {
    this.watches.forgetAllPrints()
    this.inventory.forgetAll()

    for (const deviceId of this.host.onTheLine()) {
      this.host.send(deviceId, { p: PROTOCOL_VERSION, k: 'resync' })
    }

    this.inventory.schedule()
  }

  /** Телефон отпущен: ждущее в его очереди не выполнится, его подписки и журнал команд - вон. */
  forget(deviceId: string): void {
    this.chains.cancel(deviceId)
    this.ledger.forget(deviceId)
    this.feeds.unwatch(deviceId)
    this.watches.forget(deviceId)
    this.inventory.forget(deviceId)
  }

  /** Сердцебиение линии: журналы лент, которые давно никто не смотрит, и старые команды. */
  sweep(): void {
    this.feeds.sweep()
    this.ledger.sweep()
  }

  stop(): void {
    this.chains.stop()
    this.feeds.stop()
    this.inventory.stop()
  }

  private async subscribe(deviceId: string, message: SubscribeMessage): Promise<void> {
    if (message.conversationId) {
      // Подписка заново - состояние разговора уходит, даже если оно то же: у телефона его нет.
      this.watches.freshConversation(deviceId)

      // Разговора нет (вкладку закрыли, проект закрыт) - телефону уже сказано conversationGone.
      if (!this.watches.conversation(deviceId, message.conversationId)) return

      return this.feeds.watch(deviceId, message.conversationId, message.since, message.epoch)
    }

    if (message.runId && !(await this.watches.watchRun(deviceId, message.runId))) {
      return this.notFound(deviceId, message.runId)
    }

    if (message.projectKey && !this.watches.watchQueues(deviceId, message.projectKey)) {
      return this.notFound(deviceId, message.projectKey)
    }
  }

  private unsubscribe(deviceId: string, message: UnsubscribeMessage) {
    if (message.conversationId) this.feeds.unwatch(deviceId, message.conversationId)
    if (message.runId) this.watches.unwatchRun(deviceId, message.runId)
    if (message.projectKey) this.watches.unwatchQueues(deviceId, message.projectKey)
  }

  /**
   * Команда: повтор принятой - сохранённый итог (или ничего, пока первая выполняется); новая -
   * в журнал сразу, а в работу - своей очередью, после того, что пришло раньше неё.
   */
  private command(deviceId: string, message: CmdMessage) {
    const seen = this.ledger.seen(deviceId, message.id)

    if (seen) {
      if (seen.outcome) this.reply(deviceId, message.id, seen.outcome)

      return
    }

    this.ledger.begin(deviceId, message.id)
    this.chains.run(deviceId, () => this.start(deviceId, message))
  }

  /** Начать команду и не ждать её: итог уйдёт сам, очередь телефона идёт дальше. */
  private start(deviceId: string, message: CmdMessage) {
    const still = this.chains.ticket(deviceId)
    const settle = (outcome: Outcome) => {
      this.ledger.settle(deviceId, message.id, outcome)

      if (still()) this.reply(deviceId, message.id, outcome)
    }
    const parsed = parseCommand(message.name, message.args)

    if (!parsed.ok) return settle({ ok: false, code: parsed.code })

    void this.commands.run(parsed.command).then(settle, (error: unknown) => {
      console.warn(`[remote] команда телефона ${parsed.command.name} не выполнилась:`, error)
      settle({ ok: false, code: 'failed' })
    })
  }

  private reply(deviceId: string, id: string, outcome: Outcome) {
    this.host.send(deviceId, { p: PROTOCOL_VERSION, k: 'result', id, ...outcome }, 'urgent')
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

  /** Ключи и подмена папок по текущему состоянию IDE - до первой перемены проектов или очередей. */
  private lens(): Lens {
    if (this.lensCache) return this.lensCache

    const { ports } = this.host
    const workspace = ports.workspace.getState()
    const queues = ports.scenarios.queuesView()

    this.lensCache = {
      keys: new ProjectKeys(
        workspace,
        queues.queues.map((queue) => queue.projectPath),
      ),
      redact: pathRedactor(machineRoots(workspace, queues, this.host.home)),
    }

    return this.lensCache
  }
}
