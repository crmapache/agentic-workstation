import type { ScenarioQueue } from '@shared/scenario-queues'
import type { ScenarioCode } from '@shared/scenarios'

import type { RunDesk } from './run-desk'
import type { QueueBook } from './queues/queue-book'
import * as nap from './queues/queue-nap'
import { runningItem } from './queues/queue-rules'

export type HoursHost = {
  book: QueueBook
  desk: (projectPath: string) => RunDesk
  onQueues: () => void
  notify: (title: string, body: string) => void
  /** Продолжить прогон, оборванный выходом IDE, пока очередь спала. */
  carryOn: (runId: string) => Promise<ScenarioCode | null>
  /** Шаг очереди: пришло время её часов. */
  step: (queueId: string) => Promise<void>
  /** В папке проекта работает сценарий другой очереди - проснувшись, туда не входить. */
  folderTaken: (queue: ScenarioQueue) => boolean
}

/** Таймер границы окна срабатывает чуть позже неё: на миг раньше очередь ещё не уснула бы. */
const BOUNDARY_SLACK_MS = 1_000

/** Утром прогон не продолжился - что сказать: очередь встала или ждущих за ним нет. */
const MISSED_HELD =
  '%s could not pick up where it paused for the night. Nothing after it starts until you continue it or mark it done.'
const MISSED_ALONE =
  '%s could not pick up where it paused for the night. Open its run to continue it.'

/**
 * Рабочие часы очередей (ADR 0074) - исполнение правил `queues/queue-nap.ts`: вне окна идущий
 * прогон встаёт на паузу, в начале окна снимается с неё, а оборванный выходом IDE -
 * продолжается. Зовётся из шага очереди, поэтому не спорит с запуском следующего сценария.
 * Границу окна ловит свой таймер, а не удар часов раз в полминуты: «до 19:00» - это до 19:00.
 */
export class QueueHoursKeeper {
  /** Ближайший момент, когда часам каждой очереди есть что делать. */
  private readonly moves = new Map<string, number>()
  private timer: NodeJS.Timeout | null = null
  private armedAt = 0

  constructor(private readonly host: HoursHost) {}

  /**
   * Привести очередь в согласие с её часами: уснуть, проснуться или ничего. Очередь без worktree
   * не просыпается, пока в папке проекта работает другая очередь (её поднял, например, час
   * расписания): сама, без человека, второго агента в те же файлы она не пускает. Ждёт удара
   * часов или конца того прогона, а не таймера - иначе он бил бы каждую секунду.
   */
  async keep(queueId: string, now = Date.now()): Promise<void> {
    const queue = this.host.book.get(queueId)
    const move = queue ? nap.napMove(queue, now) : null
    const waits =
      queue !== null &&
      move?.kind === 'wake' &&
      queue.closedAt === 0 &&
      this.host.folderTaken(queue)

    if (queue && move?.kind === 'sleep') this.sleep(queue, now, move.until)
    if (queue && move?.kind === 'wake' && !waits) await this.wake(queue, now)
    if (queue && move?.kind === 'retime') this.put(nap.retimeNap(queue, move.until), true)

    const latest = this.host.book.get(queueId)

    this.plan(queueId, latest && !waits ? nap.nextHoursMove(latest, now) : 0)
  }

  /** Человек сам поставил или снял паузу прогона: проснувшись, очередь его не тронет. */
  touched(runId: string): void {
    const found = this.host.book.byRun(runId)

    if (found) this.put(nap.forgetNapRun(found.queue, runId))
  }

  /** Выход из IDE: границ больше не ловить. */
  stop(): void {
    if (this.timer) clearTimeout(this.timer)

    this.timer = null
    this.armedAt = 0
    this.moves.clear()
  }

  /** Уснуть: идущий прогон - на паузу; уже стоящий на паузе человека остаётся его. */
  private sleep(queue: ScenarioQueue, now: number, until: number) {
    const running = runningItem(queue)
    const paused =
      running !== null &&
      running.runId !== '' &&
      this.host.desk(queue.projectPath).pauseForHours(running.runId)

    this.put(nap.fallAsleep(queue, now, until, paused ? running.runId : ''), true)
  }

  /**
   * Проснуться: прогон, который усыпили часы, - с паузы; оборванный выходом IDE - продолжить с
   * места. Не вышло - очередь встаёт и ждёт человека, а не перескакивает к следующему.
   */
  private async wake(queue: ScenarioQueue, now: number) {
    // Закрытая очередь ничего не продолжает: она в истории.
    const runId = queue.closedAt > 0 ? '' : (queue.nap?.runId ?? '')
    const desk = this.host.desk(queue.projectPath)

    if (runId && desk.live.has(runId)) {
      desk.control(runId, 'resume')
    } else if (runId && (await this.host.carryOn(runId))) {
      this.missed(queue, runId, now)
    }

    this.put(nap.wakeUp(this.host.book.get(queue.id) ?? queue), true)
  }

  /** Прогон не продолжился: ждущие за ним - очередь встаёт; сказать человеку - всегда. */
  private missed(queue: ScenarioQueue, runId: string, now: number) {
    const latest = this.host.book.get(queue.id) ?? queue
    const item = latest.items.find((one) => one.runId === runId)
    const held = nap.missedWake(latest, runId, now)

    this.put(held)

    if (item) {
      const words = held === latest ? MISSED_ALONE : MISSED_HELD

      this.host.notify(latest.name, words.replace('%s', item.scenarioName))
    }
  }

  /**
   * Записать очередь. quiet - сон и пробуждение по часам: это не дело очереди, и очередь, которая
   * только спит и просыпается, всё равно закроется сама после двух недель без дела.
   */
  private put(queue: ScenarioQueue, quiet = false) {
    if (this.host.book.put(queue, { quiet })) this.host.onQueues()
  }

  private plan(queueId: string, at: number) {
    if (at > 0) this.moves.set(queueId, at)
    else this.moves.delete(queueId)

    this.arm()
  }

  /** Один таймер на ближайшую границу всех очередей; она не сдвинулась - таймер тот же. */
  private arm() {
    const soonest = Math.min(...this.moves.values())

    if (soonest === this.armedAt) return
    if (this.timer) clearTimeout(this.timer)

    this.timer = null
    this.armedAt = 0

    if (!Number.isFinite(soonest)) return

    this.armedAt = soonest
    this.timer = setTimeout(
      () => this.fire(),
      Math.max(0, soonest - Date.now()) + BOUNDARY_SLACK_MS,
    )
    this.timer.unref()
  }

  /**
   * Граница пришла: шаг очередям, чья она. Их отметки снимаются сразу - шаг поставит новые; иначе
   * очередь, чей шаг ещё ждёт (идёт запуск), получала бы шаг за шагом каждую секунду.
   */
  private fire() {
    const now = Date.now()

    this.timer = null
    this.armedAt = 0

    for (const [queueId, at] of [...this.moves]) {
      if (at > now) continue

      this.moves.delete(queueId)
      void this.host.step(queueId)
    }

    this.arm()
  }
}
