import { basename } from 'node:path'

import { parseDay } from '@shared/task-clock'
import type { TrackerDue } from '@shared/tracker'
import { isInQueue } from '@shared/tracker'
import { dueKey } from '@shared/tracker-repeat'

import type { AutoRunLink } from './tracker-book'
import type { TrackerRecord } from './tracker-records'
import { isAlive, numberOf } from './tracker-records'
import type { TrackerRuns } from './tracker-runs'
import type { TrackerService } from './tracker-service'
import { TrackerTree } from './tracker-tree'
import { cardOf } from './tracker-view'

/** Как часто часы смотрят на сроки: срок в 09:00 уходит до 09:00:30. */
const TICK_MS = 30_000

/**
 * Своя правка (включили запуск, сдвинули срок в прошлое) - взгляд через пару секунд, а не через
 * полминуты.
 */
const SOON_MS = 2_000

/** Момент срока по часам этой машины: срок без времени - начало дня. null - не дата. */
const momentOf = (due: TrackerDue): number | null => {
  const day = parseDay(due.date)

  if (!day) return null

  const [hours, minutes] = (due.time ?? '00:00').split(':').map(Number)

  day.setHours(hours ?? 0, minutes ?? 0, 0, 0)

  return day.getTime()
}

/**
 * Запуск сценария карточки в срок (ADR 0103) - только на компьютере, где его включили: отметка
 * живёт в книге этого компьютера и в облако не уходит, иначе один срок поднял бы прогон на каждом
 * компьютере. На каждый срок карточка уходит один раз (firedFor): упавший прогон сам не
 * повторяется каждые полминуты, а новый срок (повтор сдвинул его, человек поменял) - новый
 * запуск. Пропущенный, пока IDE была закрыта, срок наверстывается одним запуском. До первой
 * сверки с облаком часы стоят: по старой копии машина запустила бы то, что на другой уже сделали.
 */
export class TrackerAutoRuns {
  private timer: ReturnType<typeof setInterval> | null = null
  private soon: ReturnType<typeof setTimeout> | null = null
  private ticking: Promise<void> | null = null
  private stopped = false
  private readonly unsubscribe: () => void

  constructor(
    private readonly tracker: TrackerService,
    private readonly runs: TrackerRuns,
    private readonly now: () => number = Date.now,
  ) {
    this.unsubscribe = tracker.book.onChange((change) => {
      if (change === 'local') this.tickSoon()
    })
  }

  start() {
    if (this.timer || this.stopped) return

    this.timer = setInterval(() => void this.tick(), TICK_MS)
    this.timer.unref()
    void this.tick()
  }

  /** Выход из IDE: часы стоят, начатая отправка доходит до конца. */
  async stop() {
    this.stopped = true
    this.unsubscribe()
    if (this.timer) clearInterval(this.timer)
    if (this.soon) clearTimeout(this.soon)
    this.timer = null
    this.soon = null
    await this.ticking
  }

  /** Такт: карточки, чей срок пришёл, - в очередь. Второй такт, пока идёт первый, ждёт его. */
  tick(): Promise<void> {
    if (this.ticking) return this.ticking
    if (this.stopped || !this.tracker.isSynced) return Promise.resolve()

    this.ticking = this.walk().finally(() => {
      this.ticking = null
    })

    return this.ticking
  }

  private tickSoon() {
    if (this.soon || this.stopped) return

    this.soon = setTimeout(() => {
      this.soon = null
      void this.tick()
    }, SOON_MS)
    this.soon.unref()
  }

  private async walk() {
    const { book } = this.tracker
    let marked = false

    for (const cardId of Object.keys(book.autoRuns())) {
      // Отметка и доска - свежие на каждую карточку: пока уходила предыдущая, запуск этой могли
      // выключить, а карточку - перенести или удалить.
      const link = book.autoRuns()[cardId]
      const tree = new TrackerTree(book.records())
      const record = tree.alive(cardId, 'card')
      const key = link && record && this.dueKeyOf(tree, record, link)

      if (!link || !record || !key || this.stopped) continue

      const card = cardOf(record, this.tracker.local())

      // Срок занят до отправки: такт, пришедший посреди неё, его уже не видит.
      book.setAutoRun(cardId, { ...link, firedFor: key, failure: null })
      marked = true

      // Карточку уже отправили руками на этот срок - второй прогон не нужен.
      if (isInQueue(card.run)) continue

      const outcome = await this.runs.send(
        { rootPath: link.projectPath, name: basename(link.projectPath), home: false },
        { source: { kind: 'card', cardId }, target: { kind: 'new', worktree: false } },
      )
      const after = book.autoRuns()[cardId]

      // Пока шла отправка, запуск могли выключить: отказ его не включает обратно.
      if (!outcome.ok && after) book.setAutoRun(cardId, { ...after, failure: outcome.code })
    }

    if (marked) this.tracker.refresh()
  }

  /**
   * Срок карточки, на который её пора отправить; null - не пора или нечего. Карточка - с
   * несделанным сценарием и сроком, срок пришёл и ещё не брался, проект трекера не в архиве, а
   * доска - та, что у этой папки на этой машине (папку могли перепривязать к другой доске).
   */
  private dueKeyOf(tree: TrackerTree, record: TrackerRecord, link: AutoRunLink): string | null {
    const card = cardOf(record, this.tracker.local())
    const project = tree.ancestor(record.id, 'project')

    if (card.done || !card.scenario || !card.due) return null
    if (!project || numberOf(project, 'archivedAt') !== null || !isAlive(project)) return null
    if (this.tracker.book.binding(link.projectPath) !== tree.spaceOf(record.id)) return null

    const key = dueKey(card.due)
    const moment = momentOf(card.due)

    return link.firedFor !== key && moment !== null && moment <= this.now() ? key : null
  }
}
