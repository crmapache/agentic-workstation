import type { Conversation } from '@shared/claude'
import type { ScenarioQueuesView } from '@shared/scenario-queues'
import type { ScenarioRun } from '@shared/scenario-runs'

import type { AgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'
import { ALL_PROJECTS } from '@agentic-workstation/remote-protocol/project-key'

import type { StatusClock } from './conversation-wire'
import { conversationWire } from './conversation-wire'
import type { Redact } from './fit'
import { fitValue } from './fit'
import { fitRun, fitConversation } from './fit-pending'
import type { ProjectKeys } from './project-keys'
import { runWire, queueWire, runProjectPath, runSummaryWire } from './scenario-wire'

export type WatchDeskHost = {
  send: (deviceId: string, message: AgentMessage) => boolean
  /** Телефон на связи: спящему состояние не шлётся, проснувшись, он получит последнее. */
  awake: (deviceId: string) => boolean
  conversations: () => Conversation[]
  keys: () => ProjectKeys
  redact: () => Redact
  clock: StatusClock
  queuesView: () => ScenarioQueuesView
  run: (projectPath: string, runId: string) => Promise<ScenarioRun | null>
}

/** Прогон, который смотрит телефон: последнее его состояние и что ушло телефону. */
type RunWatch = { runId: string; print: string; latest: ScenarioRun }

/** Очереди, которые смотрит телефон: ключ его подписки и папка проекта за ним (null - все). */
type QueuesWatch = { scope: string; path: string | null; print: string }

/**
 * Что телефон смотрит, кроме ленты: состояние своего разговора, прогон сценария и очереди
 * проекта (или доску всех). Каждого вида - одно на телефон (phone-messages.ts): новая подписка
 * заменяет прежнюю. Шлётся только перемена: отпечаток последнего посланного помнится на
 * телефон, а состояние IDE меняется по многу раз в секунду. Спящему - ничего: отпечаток не
 * трогается, и проснувшийся получит то, что поменялось без него.
 */
export class WatchDesk {
  private readonly conversationPrints = new Map<string, string>()
  private readonly runs = new Map<string, RunWatch>()
  private readonly queues = new Map<string, QueuesWatch>()

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

    if (!this.host.awake(deviceId)) return true

    const wire = conversationWire(
      conversation,
      keys.keyOf(conversation.projectPath),
      this.host.clock.since(conversation, Date.now()),
    )
    const fitted = fitConversation(wire, this.host.redact())
    const print = JSON.stringify(fitted)

    if (fitted && this.conversationPrints.get(deviceId) !== print) {
      const sent = this.host.send(deviceId, {
        p: PROTOCOL_VERSION,
        k: 'conversation',
        conversation: fitted,
      })

      if (sent) this.conversationPrints.set(deviceId, print)
    }

    return true
  }

  /** Подписка на разговор заново: его состояние уходит, даже если отпечаток тот же. */
  freshConversation(deviceId: string): void {
    this.conversationPrints.delete(deviceId)
  }

  /** Телефон смотрит прогон: запись целиком сейчас, дальше - каждую перемену. */
  async watchRun(deviceId: string, runId: string): Promise<boolean> {
    const projectPath = runProjectPath(this.host.queuesView(), runId)
    const run = projectPath ? await this.host.run(projectPath, runId) : null

    if (!run) return false

    this.runs.set(deviceId, { runId, print: '', latest: run })
    this.sendRun(deviceId)

    return true
  }

  runChanged(run: ScenarioRun): void {
    for (const [deviceId, watch] of this.runs) {
      if (watch.runId !== run.id) continue

      watch.latest = run
      this.sendRun(deviceId)
    }
  }

  /**
   * Очереди проекта по ключу или все (`*`): сейчас и дальше при каждой перемене. false - ключ
   * не из тех, что IDE называла: подписываться не на что.
   */
  watchQueues(deviceId: string, scope: string): boolean {
    const path = scope === ALL_PROJECTS ? null : this.host.keys().pathOf(scope)

    if (scope !== ALL_PROJECTS && path === null) return false

    this.queues.set(deviceId, { scope, path, print: '' })
    this.sendQueues(deviceId, this.host.queuesView())

    return true
  }

  queuesChanged(): void {
    if (this.queues.size === 0) return

    const view = this.host.queuesView()

    for (const deviceId of this.queues.keys()) this.sendQueues(deviceId, view)
  }

  /** Снять подписку на прогон - только если телефон смотрит именно его. */
  unwatchRun(deviceId: string, runId: string): void {
    if (this.runs.get(deviceId)?.runId === runId) this.runs.delete(deviceId)
  }

  /** Снять подписку на очереди - только если телефон смотрит именно эти. */
  unwatchQueues(deviceId: string, scope: string): void {
    if (this.queues.get(deviceId)?.scope === scope) this.queues.delete(deviceId)
  }

  /** Всё, что ему слали, - как не слали: следующее состояние уйдёт целиком. */
  forgetPrints(deviceId: string): void {
    this.conversationPrints.delete(deviceId)

    const run = this.runs.get(deviceId)
    const queues = this.queues.get(deviceId)

    if (run) run.print = ''
    if (queues) queues.print = ''
  }

  /** Телефон проснулся: прогон и очереди - какие они сейчас, если поменялись без него. */
  catchUp(deviceId: string): void {
    this.sendRun(deviceId)

    if (this.queues.has(deviceId)) this.sendQueues(deviceId, this.host.queuesView())
  }

  /** Отпечатки всех телефонов - новая линия: что ушло в старую, могло не дойти. */
  forgetAllPrints(): void {
    for (const deviceId of new Set([
      ...this.conversationPrints.keys(),
      ...this.runs.keys(),
      ...this.queues.keys(),
    ])) {
      this.forgetPrints(deviceId)
    }
  }

  forget(deviceId: string): void {
    this.conversationPrints.delete(deviceId)
    this.runs.delete(deviceId)
    this.queues.delete(deviceId)
  }

  private sendRun(deviceId: string) {
    const watch = this.runs.get(deviceId)

    if (!watch || !this.host.awake(deviceId)) return

    const keys = this.host.keys()
    const fitted = fitRun(
      runWire(watch.latest, (path) => keys.keyOf(path)),
      this.host.redact(),
    )
    const print = JSON.stringify(fitted)

    if (!fitted || watch.print === print) return
    if (this.host.send(deviceId, { p: PROTOCOL_VERSION, k: 'run', run: fitted }))
      watch.print = print
  }

  /** Очереди проекта по папке; ключ проекта тот же, открыт он или нет. */
  private sendQueues(deviceId: string, view: ScenarioQueuesView) {
    const watch = this.queues.get(deviceId)

    if (!watch || !this.host.awake(deviceId)) return

    const keys = this.host.keys()
    const keyOf = (path: string) => keys.keyOf(path)
    const inScope = (path: string) => watch.path === null || path === watch.path
    const fitted = fitValue<AgentMessage>(
      {
        p: PROTOCOL_VERSION,
        k: 'queues',
        // Ключ подписки - как телефон его прислал: по нему он узнаёт, на что это ответ.
        scope: watch.scope,
        queues: view.queues
          .filter((queue) => inScope(queue.projectPath))
          .map((queue) => queueWire(queue, keyOf, (path) => keys.nameOf(path))),
        live: view.live
          .filter((run) => inScope(run.projectPath))
          .map((run) => runSummaryWire(run, keyOf)),
      },
      undefined,
      this.host.redact(),
    )
    const print = JSON.stringify(fitted)

    if (!fitted || watch.print === print) return
    if (this.host.send(deviceId, fitted)) watch.print = print
  }
}
