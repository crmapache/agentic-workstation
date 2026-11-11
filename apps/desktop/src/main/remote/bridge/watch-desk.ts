import type { Conversation } from '@shared/claude'
import type { ScenarioQueuesView } from '@shared/scenario-queues'
import type { ScenarioRun } from '@shared/scenario-runs'

import type { AgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'
import { ALL_PROJECTS } from '@agentic-workstation/remote-protocol/project-key'

import type { StatusClock } from './conversation-wire'
import { conversationWire } from './conversation-wire'
import { fitValue } from './fit'
import type { ProjectKeys } from './project-keys'
import { runWire, queueWire, runProjectPath, runSummaryWire } from './scenario-wire'

export type WatchDeskHost = {
  send: (deviceId: string, message: AgentMessage) => void
  conversations: () => Conversation[]
  keys: () => ProjectKeys
  clock: StatusClock
  queuesView: () => ScenarioQueuesView
  run: (projectPath: string, runId: string) => Promise<ScenarioRun | null>
}

/**
 * Что телефон смотрит, кроме ленты: состояние своего разговора, прогон сценария и очереди
 * проекта (или доску всех). Шлётся только перемена: отпечаток последнего посланного помнится
 * на телефон, а состояние IDE меняется по многу раз в секунду.
 */
export class WatchDesk {
  private readonly conversationPrints = new Map<string, string>()
  private readonly runs = new Map<string, { runId: string; print: string }>()
  private readonly queues = new Map<string, { scope: string; print: string }>()

  constructor(private readonly host: WatchDeskHost) {}

  /**
   * Состояние разговора телефону, если поменялось. false - разговора больше нет (или проект
   * закрыт): телефону сказано, подписка снимается выше.
   */
  conversation(deviceId: string, conversationId: string): boolean {
    const keys = this.host.keys()
    const conversation = this.host.conversations().find((one) => one.id === conversationId)

    if (!conversation || !keys.isOpen(conversation.projectPath)) {
      this.conversationPrints.delete(deviceId)
      this.host.send(deviceId, { p: PROTOCOL_VERSION, k: 'conversationGone', conversationId })

      return false
    }

    const wire = conversationWire(
      conversation,
      keys.keyOf(conversation.projectPath),
      this.host.clock.since(conversation, Date.now()),
    )
    const fitted = fitValue(wire)
    const print = JSON.stringify(fitted)

    if (fitted && this.conversationPrints.get(deviceId) !== print) {
      this.conversationPrints.set(deviceId, print)
      this.host.send(deviceId, { p: PROTOCOL_VERSION, k: 'conversation', conversation: fitted })
    }

    return true
  }

  /** Телефон смотрит прогон: запись целиком сейчас, дальше - каждую перемену. */
  async watchRun(deviceId: string, runId: string): Promise<boolean> {
    const projectPath = runProjectPath(this.host.queuesView(), runId)
    const run = projectPath ? await this.host.run(projectPath, runId) : null

    if (!run) return false

    this.runs.set(deviceId, { runId, print: '' })
    this.runChanged(run)

    return true
  }

  runChanged(run: ScenarioRun): void {
    const watchers = [...this.runs].filter(([, watch]) => watch.runId === run.id)

    if (watchers.length === 0) return

    const fitted = fitValue(runWire(run, (path) => this.host.keys().keyOf(path)))
    const print = JSON.stringify(fitted)

    for (const [deviceId, watch] of watchers) {
      if (!fitted || watch.print === print) continue

      watch.print = print
      this.host.send(deviceId, { p: PROTOCOL_VERSION, k: 'run', run: fitted })
    }
  }

  /** Очереди проекта по ключу или все (`*`): сейчас и дальше при каждой перемене. */
  watchQueues(deviceId: string, scope: string): void {
    this.queues.set(deviceId, { scope, print: '' })
    this.queuesChanged()
  }

  queuesChanged(): void {
    if (this.queues.size === 0) return

    const view = this.host.queuesView()
    const keys = this.host.keys()
    const keyOf = (path: string) => keys.keyOf(path)

    for (const [deviceId, watch] of this.queues) {
      const inScope = (path: string) => watch.scope === ALL_PROJECTS || keyOf(path) === watch.scope
      const message: AgentMessage = {
        p: PROTOCOL_VERSION,
        k: 'queues',
        scope: watch.scope,
        queues: view.queues
          .filter((queue) => inScope(queue.projectPath))
          .map((queue) => queueWire(queue, keyOf)),
        live: view.live
          .filter((run) => inScope(run.projectPath))
          .map((run) => runSummaryWire(run, keyOf)),
      }
      const fitted = fitValue(message)
      const print = JSON.stringify(fitted)

      if (!fitted || watch.print === print) continue

      watch.print = print
      this.host.send(deviceId, fitted)
    }
  }

  unwatchRun(deviceId: string): void {
    this.runs.delete(deviceId)
  }

  unwatchQueues(deviceId: string): void {
    this.queues.delete(deviceId)
  }

  /** Новые ключи у телефона: всё, что ему слали, - как не слали. */
  forgetPrints(deviceId: string): void {
    this.conversationPrints.delete(deviceId)

    const run = this.runs.get(deviceId)
    const queues = this.queues.get(deviceId)

    if (run) run.print = ''
    if (queues) queues.print = ''
  }

  forget(deviceId: string): void {
    this.conversationPrints.delete(deviceId)
    this.runs.delete(deviceId)
    this.queues.delete(deviceId)
  }
}
