import { randomUUID } from 'node:crypto'

import type { ProviderId } from '@shared/providers'
import type {
  QueueItem,
  QueueAction,
  ScenarioQueue,
  ScenarioStartOutcome,
  ScenarioStartRequest,
} from '@shared/scenario-queues'
import { answersOf, isRunnable, missingInputs } from '@shared/scenario-rules'
import type { ScenarioRun } from '@shared/scenario-runs'
import type { ScenarioCode } from '@shared/scenarios'

import type { ScenarioProvider } from '../providers/scenario-provider'
import { launchRun, carryOnRun } from './launch-run'
import { queueWorktree } from './queue-worktree'
import type { RunDesk } from './run-desk'
import type { QueueBook } from './queues/queue-book'
import * as rules from './queues/queue-rules'
import { scopeOf } from './store/scenario-parse'

export type RunnerHost = {
  book: QueueBook
  desk: (projectPath: string) => RunDesk
  provider: (id: ProviderId) => ScenarioProvider | null
  worktreesRoot: string
  onQueues: () => void
  notify: (title: string, body: string) => void
}

const shortId = () => randomUUID().replaceAll('-', '').slice(0, 16)

/** Что сказать человеку, когда очередь встала сама. */
const HOLD_WORDS: Record<string, string> = {
  stopAfter: 'stopped after %s, as you asked',
  failed: '%s did not finish. Nothing after it starts until you resume.',
  refused: '%s would not start. It is still first in line.',
}

/**
 * Исполнитель очередей: ставит сценарии, поднимает следующий, когда очередь свободна, решает,
 * что делать по концу прогона, и исполняет правки человека. Сами решения - чистые правила
 * (`queues/queue-rules.ts`), здесь - только их исполнение: процессы, диск, git, уведомления.
 */
export class QueueRunner {
  /** Очереди, которые сейчас делают шаг: второй шаг той же очереди подождёт первого. */
  private readonly stepping = new Map<string, Promise<void>>()

  constructor(private readonly host: RunnerHost) {}

  /** Поставить сценарий: в новую очередь (с worktree или без) или в существующую. */
  async start(request: ScenarioStartRequest, from = ''): Promise<ScenarioStartOutcome> {
    const desk = this.host.desk(request.projectPath)
    const scenario = await desk.store.find(request.scenarioId, scopeOf(request.scope))

    if (!scenario) return { ok: false, code: 'scenarioGone' }
    if (!isRunnable(scenario)) return { ok: false, code: 'scenarioBroken' }
    if (missingInputs(scenario, request.inputs).length > 0)
      return { ok: false, code: 'scenarioMissingInput' }
    if (!this.host.provider(request.provider)) return { ok: false, code: 'providerMissing' }

    const item: QueueItem = {
      id: shortId(),
      scenarioId: scenario.id,
      scope: scenario.scope,
      scenarioName: scenario.name,
      inputs: answersOf(scenario, request.inputs),
      provider: request.provider,
      afterSuccess: request.afterSuccess,
      addedAt: Date.now(),
      runId: '',
      state: 'waiting',
      refusal: null,
    }
    const placed =
      request.target.kind === 'new'
        ? await this.openQueue(request.projectPath, item, request.target.worktree)
        : this.joinQueue(request.target.queueId, request.projectPath, item)

    if ('code' in placed) return { ok: false, ...placed }

    this.host.onQueues()
    void this.name(placed.queueId)
    await this.step(placed.queueId, from)

    return { ok: true, queueId: placed.queueId, itemId: item.id }
  }

  /** Сделать шаг очереди: поднять следующий, если она свободна. */
  step(queueId: string, from = ''): Promise<void> {
    const before = this.stepping.get(queueId) ?? Promise.resolve()
    const next = before
      .then(() => this.stepNow(queueId, from))
      .catch((error: unknown) => {
        console.warn('[scenarios] очередь споткнулась:', error)
      })

    this.stepping.set(queueId, next)
    void next.finally(() => {
      if (this.stepping.get(queueId) === next) this.stepping.delete(queueId)
    })

    return next
  }

  /** Прогон кончился: элемент получает исход, очередь решает, встать ей или идти дальше. */
  async finished(run: ScenarioRun): Promise<void> {
    const found = this.host.book.byRun(run.id)

    if (!found) return

    const outcome: rules.ItemOutcome =
      run.state === 'done' || run.state === 'failed' ? run.state : 'stopped'
    const settled = rules.settleItem(found.queue, found.itemId, outcome, Date.now())

    this.host.book.put(settled)
    this.host.onQueues()
    this.sayHold(found.queue, settled)
    await this.step(settled.id)
  }

  /** Правка очереди руками. */
  async act(queueId: string, action: QueueAction): Promise<ScenarioCode | null> {
    const queue = this.host.book.get(queueId)

    if (!queue) return 'queueGone'

    const changed = this.applied(queue, action)

    if (!changed) return action.kind === 'close' ? 'queueBusy' : null

    this.host.book.put(changed)
    this.host.onQueues()

    if (action.kind === 'close') await queueWorktree.dropIfEmpty(changed, this.host)
    if (action.kind === 'resume') await this.step(queueId)

    return null
  }

  /** Подхватить остановленный прогон элемента: только последний прошедший, пока за ним пусто. */
  async carryOn(runId: string): Promise<ScenarioCode | null> {
    const found = this.host.book.byRun(runId)

    if (!found) return 'runGone'

    const reopened = rules.reopenItem(found.queue, found.itemId)

    if (!reopened) return 'runNotResumable'

    const item = reopened.items.find((one) => one.id === found.itemId)
    const provider = item && this.host.provider(item.provider)

    if (!provider) return 'providerMissing'

    const refusal = await carryOnRun(this.host.desk(found.queue.projectPath), provider, runId)

    if (refusal) return refusal

    this.host.book.put(reopened)
    this.host.onQueues()

    return null
  }

  /** Имя от ИИ: по сценариям очереди и ответам на их вводы, пока человек не назвал сам. */
  async name(queueId: string): Promise<void> {
    const queue = this.host.book.get(queueId)
    const first = queue?.items[0]

    if (!queue || !first || queue.nameSource === 'user') return

    const provider = this.host.provider(first.provider)
    const described = queue.items
      .map((item) => {
        const answers = Object.values(item.inputs).filter((value) => value.trim())

        return `- ${item.scenarioName}${answers.length > 0 ? `: ${answers.join('; ')}` : ''}`
      })
      .join('\n')
    const title = await provider?.suggestTitle(`Scenarios queued:\n${described}`).catch(() => null)
    const now = this.host.book.get(queueId)

    if (!title || !now) return

    const renamed = rules.renameQueue(now, title, 'ai')

    if (this.host.book.put(renamed)) this.host.onQueues()
  }

  private async openQueue(
    projectPath: string,
    item: QueueItem,
    worktree: boolean,
  ): Promise<{ queueId: string } | { code: ScenarioCode; detail?: string }> {
    const id = shortId()
    const workdir = worktree
      ? await queueWorktree.create(projectPath, item.scenarioName, id, this.host.worktreesRoot)
      : ({ kind: 'project' } as const)

    if ('code' in workdir) return workdir

    const queue: ScenarioQueue = {
      id,
      projectPath,
      name: rules.fallbackName(item.scenarioName, item.inputs),
      nameSource: 'fallback',
      createdAt: Date.now(),
      closedAt: 0,
      workdir,
      items: [item],
      stopAfterItemId: '',
      hold: null,
    }

    this.host.book.put(queue)

    return { queueId: id }
  }

  private joinQueue(
    queueId: string,
    projectPath: string,
    item: QueueItem,
  ): { queueId: string } | { code: ScenarioCode } {
    const queue = this.host.book.get(queueId)

    if (!queue || queue.projectPath !== projectPath) return { code: 'queueGone' }
    if (queue.closedAt > 0) return { code: 'queueClosed' }

    this.host.book.put(rules.addItem(queue, item))

    return { queueId }
  }

  private async stepNow(queueId: string, from: string): Promise<void> {
    const queue = this.host.book.get(queueId)
    const item = queue && rules.nextToStart(queue)

    if (!queue || !item) return

    const provider = this.host.provider(item.provider)
    const runId = shortId()
    const cwd = queue.workdir.kind === 'worktree' ? queue.workdir.projectDir : queue.projectPath
    const refusal: ScenarioCode | null =
      queue.workdir.kind === 'worktree' && queue.workdir.removed
        ? 'worktreeFailed'
        : provider
          ? await launchRun(this.host.desk(queue.projectPath), provider, {
              id: item.scenarioId,
              scope: item.scope,
              inputs: item.inputs,
              from,
              runId,
              cwd,
              queueId,
              itemId: item.id,
            })
          : 'providerMissing'
    const latest = this.host.book.get(queueId) ?? queue
    const next = refusal
      ? rules.markRefused(latest, item.id, refusal, Date.now())
      : rules.markStarted(latest, item.id, runId)

    this.host.book.put(next)
    this.host.onQueues()

    if (refusal) this.sayHold(latest, next)
  }

  private applied(queue: ScenarioQueue, action: QueueAction): ScenarioQueue | null {
    switch (action.kind) {
      case 'remove':
        return rules.removeItem(queue, action.itemId)
      case 'move':
        return rules.moveItem(queue, action.itemId, action.by)
      case 'mode':
        return rules.setAfterSuccess(queue, action.itemId, action.afterSuccess)
      case 'stopAfter':
        return rules.setStopAfter(queue, action.itemId)
      case 'resume':
        return rules.resumeQueue(queue)
      case 'rename':
        return rules.renameQueue(queue, action.name, 'user')
      case 'close':
        return rules.closeQueue(queue, Date.now())
    }
  }

  /** Очередь только что встала сама - сказать почему уведомлением ОС. */
  private sayHold(before: ScenarioQueue, after: ScenarioQueue) {
    const hold = after.hold

    if (!hold || before.hold === hold) return

    const item = after.items.find((one) => one.id === hold.itemId)
    const words = HOLD_WORDS[hold.reason]

    if (item && words) this.host.notify(after.name, words.replace('%s', item.scenarioName))
  }
}
