import { existsSync } from 'node:fs'

import type { ProviderId } from '@shared/providers'
import type {
  QueueAction,
  ScenarioQueue,
  ScenarioStartOutcome,
  ScenarioStartRequest,
} from '@shared/scenario-queues'
import type { ScenarioRun } from '@shared/scenario-runs'
import type { ScenarioCode } from '@shared/scenarios'

import type { ScenarioProvider } from '../providers/scenario-provider'
import { launchRun, carryOnRun } from './launch-run'
import { QueueHoursKeeper } from './queue-hours-keeper'
import { QueueNaming } from './queue-naming'
import { shortId, placeItem } from './queue-placing'
import { queueWorktree } from './queue-worktree'
import type { RunDesk } from './run-desk'
import type { QueueBook } from './queues/queue-book'
import { setHours, forgetNapRun } from './queues/queue-nap'
import * as rules from './queues/queue-rules'

export type RunnerHost = {
  book: QueueBook
  desk: (projectPath: string) => RunDesk
  provider: (id: ProviderId) => ScenarioProvider | null
  worktreesRoot: string
  onQueues: () => void
  notify: (title: string, body: string) => void
  /** IDE закрывается: новых прогонов не поднимать. */
  isClosing: () => boolean
  /** Очереди, чей worktree сейчас удаляется (git на это тратит минуты). */
  removing: Set<string>
}

/**
 * Папка, где работает очередь: проект или папка проекта в её worktree; null - worktree удалён
 * или его папки больше нет на диске (стёрли руками) - CLI в ней упал бы с «claude ENOENT».
 */
const workdirOf = (queue: ScenarioQueue): string | null => {
  if (queue.workdir.kind === 'project') return queue.projectPath
  if (queue.workdir.removed || !existsSync(queue.workdir.projectDir)) return null

  return queue.workdir.projectDir
}

/** Что сказать человеку, когда очередь встала сама. */
const HOLD_WORDS: Record<string, string> = {
  stopAfter: 'stopped after %s, as you asked',
  failed: '%s did not finish. Nothing after it starts until you continue it or mark it done.',
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
  /** Идущие постановки: создание worktree длится минутами, выход из IDE их дожидается. */
  private readonly starting = new Set<Promise<unknown>>()
  private readonly naming: QueueNaming
  private readonly hours: QueueHoursKeeper

  constructor(private readonly host: RunnerHost) {
    this.naming = new QueueNaming(host)
    this.hours = new QueueHoursKeeper({
      ...host,
      carryOn: (runId) => this.carryOn(runId),
      step: (queueId) => this.step(queueId),
      folderTaken: (queue) => this.folderTaken(queue),
    })
  }

  /** Поставить сценарий: в новую очередь (с worktree или без) или в существующую. */
  start(request: ScenarioStartRequest, from = ''): Promise<ScenarioStartOutcome> {
    const work = this.startNow(request, from)

    this.starting.add(work)
    void work.finally(() => this.starting.delete(work))

    return work
  }

  private async startNow(
    request: ScenarioStartRequest,
    from: string,
  ): Promise<ScenarioStartOutcome> {
    if (this.host.isClosing()) return { ok: false, code: 'runBusy' }

    const placed = await placeItem(this.host, request)
    if ('code' in placed) return { ok: false, ...placed }

    this.host.onQueues()
    void this.name(placed.queueId)
    await this.step(placed.queueId, from)

    return { ok: true, queueId: placed.queueId, itemId: placed.itemId }
  }

  /** Идёт ли в папке самого проекта (без worktree) какой-нибудь сценарий. */
  folderBusy(projectPath: string): boolean {
    return this.host.book
      .all()
      .some(
        (queue) =>
          queue.projectPath === projectPath &&
          queue.closedAt === 0 &&
          queue.workdir.kind === 'project' &&
          rules.runningItem(queue) !== null,
      )
  }

  /**
   * В папке проекта идёт сценарий другой открытой очереди. Прогон, который спит по рабочим часам,
   * папку не занимает: иначе две спящие очереди в одной папке ждали бы друг друга вечно.
   */
  private folderTaken(queue: ScenarioQueue): boolean {
    if (queue.workdir.kind !== 'project') return false

    return this.host.book.all().some((other) => {
      const running =
        other.id !== queue.id &&
        other.projectPath === queue.projectPath &&
        other.closedAt === 0 &&
        other.workdir.kind === 'project'
          ? rules.runningItem(other)
          : null

      return running !== null && other.nap?.runId !== running.runId
    })
  }

  /** Почему элемент не стартовал; null - стартовал или ещё ждёт своей очереди. */
  refusalOf(queueId: string, itemId: string): ScenarioCode | null {
    return this.host.book.get(queueId)?.items.find((item) => item.id === itemId)?.refusal ?? null
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

  /** Выход из IDE ждёт шагов, которые уже начались: они могли быть посреди запуска. */
  async settle(): Promise<void> {
    this.hours.stop()
    await Promise.all([...this.starting, ...this.stepping.values()])
  }

  /** Человек сам поставил или снял паузу прогона: рабочие часы очереди его больше не будят. */
  touched(runId: string): void {
    this.hours.touched(runId)
  }

  /** Прогон кончился: элемент получает исход, очередь решает, встать ей или идти дальше. */
  async finished(run: ScenarioRun): Promise<void> {
    const found = this.host.book.byRun(run.id)

    if (!found) return

    const outcome: rules.ItemOutcome =
      run.state === 'done' || run.state === 'failed' ? run.state : 'stopped'
    // Кончился - будить нечего: проснувшись, очередь возьмёт следующий, а не этот.
    const settled = forgetNapRun(
      rules.settleItem(found.queue, found.itemId, outcome, Date.now()),
      run.id,
    )

    this.host.book.put(settled)
    this.host.onQueues()
    this.sayHold(found.queue, settled)
    await this.step(settled.id)

    // Папка проекта освободилась - проснуться может спящая очередь, которая её ждала.
    for (const other of this.host.book.all()) {
      if (other.nap && other.id !== settled.id && other.projectPath === settled.projectPath) {
        void this.step(other.id)
      }
    }
  }

  /** Правка очереди руками. */
  async act(queueId: string, action: QueueAction): Promise<ScenarioCode | null> {
    const queue = this.host.book.get(queueId)

    if (!queue) return 'queueGone'

    // Resume над недоделанным - продолжить его прогон с карточки, где он встал: мимо него очередь
    // не идёт (ADR 0082).
    const stuck = action.kind === 'resume' ? rules.resumeTarget(queue) : null

    if (stuck) return stuck.runId ? this.carryOn(stuck.runId) : 'runGone'

    const changed = this.applied(queue, action)

    if (!changed) return action.kind === 'close' ? 'queueBusy' : null

    this.host.book.put(changed)
    this.host.onQueues()

    if (action.kind === 'close') {
      await queueWorktree.dropIfEmpty(changed, this.host)

      return null
    }

    // Человек стёр имя - имя снова за ИИ.
    if (action.kind === 'rename' && changed.nameSource === 'fallback') void this.name(queueId)
    // Правка могла снять остановку (убран отказавший элемент, помечен выполненным) или поменять
    // часы (уснуть, проснуться) - шаг сразу, а не по таймеру.
    await this.step(queueId)

    return null
  }

  /** Подхватить остановленный прогон элемента: только последний прошедший, пока за ним пусто. */
  async carryOn(runId: string): Promise<ScenarioCode | null> {
    const found = this.host.book.byRun(runId)

    if (!found) return 'runGone'

    const reopened = rules.reopenItem(found.queue, found.itemId)

    if (!reopened) return 'runNotResumable'
    // Worktree очереди удалён или удаляется - прогону негде продолжаться.
    if (!workdirOf(found.queue) || this.host.removing.has(found.queue.id)) return 'worktreeFailed'

    const item = reopened.items.find((one) => one.id === found.itemId)
    const provider = item && this.host.provider(item.provider)

    if (!provider) return 'providerMissing'

    const refusal = await carryOnRun(this.host.desk(found.queue.projectPath), provider, runId)

    if (refusal) return refusal

    // Пока прогон поднимался, очередь могли поправить (убрать ждущие, добавить): элемент
    // помечается идущим в свежей очереди, а не в снимке до ожидания. Закрыли за это время - её
    // не открывать: прогон доиграет, и его исход ляжет на элемент.
    const fresh = rules.reopenItem(this.host.book.get(found.queue.id) ?? reopened, found.itemId)

    if (fresh) this.host.book.put(fresh)

    this.host.onQueues()

    return null
  }

  /** Имя от ИИ - см. QueueNaming: принимается ответ только на свежий вопрос. */
  name(queueId: string): Promise<void> {
    return this.naming.name(queueId)
  }

  private async stepNow(queueId: string, from: string): Promise<void> {
    if (!this.host.book.get(queueId) || this.host.isClosing()) return

    // Сначала часы: вне окна идущий встаёт на паузу, в начале окна - снимается с неё.
    await this.hours.keep(queueId)

    const found = this.host.book.get(queueId)

    if (!found) return

    const queue = rules.holdBeforeFailure(found, Date.now())

    // Следующий ждёт успеха, а перед ним неуспех - очередь встаёт и говорит почему.
    if (queue !== found) {
      this.host.book.put(queue)
      this.host.onQueues()
      this.sayHold(found, queue)

      return
    }

    const item = rules.nextToStart(queue, Date.now())

    // Worktree удаляется прямо сейчас - в его папке ничего не начинать.
    if (!item || this.host.removing.has(queueId)) return

    const provider = this.host.provider(item.provider)
    const runId = shortId()
    const cwd = workdirOf(queue)
    const refusal: ScenarioCode | null = !cwd
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
      case 'stopAfter':
        return rules.setStopAfter(queue, action.itemId)
      case 'resume':
        return rules.resumeQueue(queue)
      case 'markDone':
        return rules.markDoneByHand(queue, action.itemId, Date.now())
      case 'rename':
        return rules.renameQueue(queue, action.name, 'user')
      case 'clear':
        return rules.clearWaiting(queue)
      case 'hours':
        return setHours(queue, action.hours)
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
