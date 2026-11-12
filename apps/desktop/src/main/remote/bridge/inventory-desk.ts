import type { ProviderInfo } from '@shared/providers'

import type { AgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'

import type { BridgePorts } from './bridge-ports'
import type { StatusClock } from './conversation-wire'
import type { Redact } from './fit'
import { fitValue } from './fit'
import { inventoryOf, inventoryPrint } from './inventory'
import type { ProjectKeys } from './project-keys'

/** Начало хода, вопрос и ответ приходят за миллисекунды - список шлётся один раз. */
const DEBOUNCE_MS = 300

export type InventoryDeskHost = {
  ports: BridgePorts
  send: (deviceId: string, message: AgentMessage) => boolean
  /** Телефоны на связи: им - новый список, когда он поменялся. */
  onTheLine: () => Set<string>
  keys: () => ProjectKeys
  redact: () => Redact
  clock: StatusClock
  machine: () => { label: string; ideVersion: string }
  epoch: string
}

/**
 * Список машины телефонам: на hello и inventory - сейчас, при переменах в IDE - каждому на
 * связи, у кого он другой. Что кому ушло, помнится по телефону: телефон, вернувшийся из сна,
 * получает своё, а не молчание, потому что другой уже видел этот список. Провайдеры
 * спрашиваются при старте линии, а не на первом hello: список, ушедший до него, был бы без них.
 */
export class InventoryDesk {
  private providers: ProviderInfo[] = []
  private readonly loaded: Promise<void>
  private readonly sent = new Map<string, string>()
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly host: InventoryDeskHost) {
    this.loaded = this.refreshProviders()
  }

  /**
   * Телефон спросил: список ему сейчас, что бы ему ни слали раньше. Провайдеры заодно
   * спрашиваются заново (Claude Code могли поставить) - перемена уйдёт следом сама.
   */
  async answer(deviceId: string, still: () => boolean): Promise<void> {
    await this.loaded

    if (!still()) return

    this.sendTo([deviceId], false)
    void this.refreshProviders().then(() => this.schedule())
  }

  /** Перемена в IDE: список - каждому на связи, у кого он теперь другой. */
  schedule(): void {
    if (this.timer) return

    this.timer = setTimeout(() => {
      this.timer = null
      this.sendTo([...this.host.onTheLine()], true)
    }, DEBOUNCE_MS)
    this.timer.unref()
  }

  /** Телефон вернулся из сна: список - если он другой, чем ушёл ему в последний раз. */
  catchUp(deviceId: string): void {
    this.sendTo([deviceId], true)
  }

  /** Посланное телефону - как не посланное (новые ключи, обвал очереди, новая линия). */
  forget(deviceId: string): void {
    this.sent.delete(deviceId)
  }

  forgetAll(): void {
    this.sent.clear()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)

    this.timer = null
  }

  private async refreshProviders(): Promise<void> {
    try {
      this.providers = await this.host.ports.conversations.providers()
    } catch (error) {
      console.warn('[remote] список провайдеров не получен:', error)
    }
  }

  private sendTo(deviceIds: readonly string[], onlyChanged: boolean) {
    if (deviceIds.length === 0) return

    const { ports } = this.host
    const inventory = inventoryOf({
      workspace: ports.workspace.getState(),
      claude: ports.conversations.getState(),
      queues: ports.scenarios.queuesView(),
      providers: this.providers,
      keys: this.host.keys(),
      clock: this.host.clock,
      machine: this.host.machine(),
      epoch: this.host.epoch,
      now: Date.now(),
    })
    const fitted = fitValue(inventory, undefined, this.host.redact())

    if (!fitted) return console.warn('[remote] список машины не влезает в кадр - не послан')

    const print = inventoryPrint(fitted)

    for (const deviceId of deviceIds) {
      if (onlyChanged && this.sent.get(deviceId) === print) continue
      if (this.host.send(deviceId, fitted)) this.sent.set(deviceId, print)
    }
  }
}
