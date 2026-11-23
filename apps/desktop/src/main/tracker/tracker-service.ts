import type { TrackerOp, TrackerBoard, TrackerOutcome } from '@shared/tracker'

import type { TrackerBook } from './tracker-book'
import { TrackerError } from './tracker-fields'
import { healOrphans } from './tracker-heal'
import { applyOp } from './tracker-ops'
import type { TrackerPlace } from './tracker-spaces'
import { readRemote, resolveSpace, mergeTwinSpaces } from './tracker-spaces'
import { TrackerTree } from './tracker-tree'
import type { CardLocal, RunStateOf } from './tracker-view'
import { boardOf, expiredArchives } from './tracker-view'

export type TrackerEvents = {
  /** Доска проекта поменялась (своя правка, облако, очередь сценариев). */
  onBoard: (board: TrackerBoard) => void
}

export type TrackerOptions = {
  book: TrackerBook
  events: TrackerEvents
  now?: () => number
  /** Адрес origin проекта: в тестах - подставной, без git. */
  remoteOf?: (rootPath: string) => Promise<string | null>
  /**
   * Срок архива и запуск карточек в срок - только после markSynced (первой сверки с облаком), а
   * не со старта.
   */
  waitForSync?: boolean
}

/** Как часто трекер сам удаляет проекты, пролежавшие в архиве свой срок. */
const PURGE_EVERY_MS = 6 * 60 * 60 * 1000

/**
 * Трекер задач (ADR 0101): доски проектов IDE поверх книги записей. Окно и инструменты MCP
 * правят доску одними и теми же правками (TrackerOp), каждая перемена - новая доска в окно.
 * Доску смотрят по пути проекта: id проекта IDE меняется с каждым открытием папки.
 */
export class TrackerService {
  private readonly now: () => number
  private readonly remoteOf: (rootPath: string) => Promise<string | null>
  /** Проекты, чьи доски уже смотрели: им и шлются перемены. */
  private readonly watched = new Map<string, TrackerPlace>()
  private readonly remotes = new Map<string, Promise<string | null>>()
  private runStateOf: RunStateOf = () => 'gone'
  private redraw: ReturnType<typeof setTimeout> | null = null
  private readonly purging: ReturnType<typeof setInterval>
  /**
   * Книга сверена с облаком (или облака нет): можно удалять проекты с вышедшим сроком и запускать
   * карточки в срок - по устаревшей копии машина сделала бы то, что другая уже отменила или
   * сделала.
   */
  private synced: boolean
  private staleSince = 0

  constructor(private readonly options: TrackerOptions) {
    this.now = options.now ?? Date.now
    this.remoteOf = options.remoteOf ?? readRemote
    options.book.onChange((change) => {
      // Пришло из облака: двойники пространств и сироты встречных удалений сводятся здесь.
      if (change === 'remote') {
        mergeTwinSpaces(options.book)
        healOrphans(options.book)
      }

      this.scheduleRedraw()
    })
    this.synced = options.waitForSync !== true
    this.purgeExpired()
    this.purging = setInterval(() => this.purgeExpired(), PURGE_EVERY_MS)
    this.purging.unref()
  }

  get book(): TrackerBook {
    return this.options.book
  }

  /** Откуда брать состояние очереди по карточке: подключает связка со сценариями. */
  setRunState(runStateOf: RunStateOf) {
    this.runStateOf = runStateOf
    this.scheduleRedraw()
  }

  /** Что о карточках знает только этот компьютер - для вида карточки. */
  local(): CardLocal {
    return { runs: this.book.runs(), autoRuns: this.book.autoRuns(), runState: this.runStateOf }
  }

  /** Пространство проекта IDE на этом компьютере (новое, если доски ещё не было). */
  async spaceOf(place: TrackerPlace): Promise<string> {
    let remote = this.remotes.get(place.rootPath)

    if (!remote) {
      remote = this.remoteOf(place.rootPath)
      this.remotes.set(place.rootPath, remote)
    }

    const spaceId = resolveSpace(this.book, place, await remote)

    this.watched.set(place.rootPath, place)

    return spaceId
  }

  async board(place: TrackerPlace): Promise<TrackerBoard> {
    return this.boardIn(place.rootPath, await this.spaceOf(place))
  }

  /**
   * Проекты IDE этого компьютера, на чьей доске лежит запись (ссылка на карточку из чата, ADR
   * 0113): пути, привязанные к её пространству. Ничего не заводит - board завёл бы доску каждому
   * проекту, где её ищут, и новое пространство ушло бы в облако.
   */
  pathsOf(id: string): string[] {
    const spaceId = new TrackerTree(this.book.records()).spaceOf(id)

    if (!spaceId) return []

    return Object.entries(this.book.bindings())
      .filter(([, bound]) => bound === spaceId)
      .map(([path]) => path)
  }

  /** Правка доски; отказ - кодом. */
  async apply(place: TrackerPlace, op: TrackerOp): Promise<TrackerOutcome> {
    const spaceId = await this.spaceOf(place)

    try {
      const done = applyOp(
        {
          book: this.book,
          spaceId,
          projectPath: place.rootPath,
          now: this.now(),
          local: this.local(),
        },
        op,
      )

      return { ok: true, board: this.boardIn(place.rootPath, spaceId), ...done }
    } catch (error) {
      if (error instanceof TrackerError) return { ok: false, code: error.code }

      throw error
    }
  }

  /**
   * Книга сверена с облаком: теперь срок архива и запуск в срок считаются по свежим записям.
   * roundStartedAt - начало захода сверки: заход, начатый раньше, чем копия устарела, не в счёт.
   */
  markSynced(roundStartedAt = Number.POSITIVE_INFINITY) {
    if (this.synced || roundStartedAt < this.staleSince) return

    this.synced = true
    this.purgeExpired()
  }

  /**
   * Копия могла устареть: связь с облаком пропала или компьютер проснулся. Срок архива и запуск
   * в срок ждут следующей сверки - за сон другой компьютер мог сделать карточку или вернуть
   * проект.
   */
  markStale() {
    this.synced = false
    this.staleSince = this.now()
  }

  get isSynced(): boolean {
    return this.synced
  }

  /** Перерисовать доски: поменялось то, что видно на карточках, но не в книге (очередь). */
  refresh() {
    this.scheduleRedraw()
  }

  /** Записать книгу на диск сейчас (выход из IDE). */
  async close() {
    clearInterval(this.purging)
    if (this.redraw) clearTimeout(this.redraw)
    await this.book.flush()
  }

  private boardIn(rootPath: string, spaceId: string): TrackerBoard {
    return boardOf(new TrackerTree(this.book.records()), spaceId, rootPath, this.local())
  }

  /** Перемены идут пачками (облако приносит десятки записей) - перерисовка одна. */
  private scheduleRedraw() {
    if (this.redraw) return

    this.redraw = setTimeout(() => {
      this.redraw = null

      for (const [rootPath] of this.watched) {
        const spaceId = this.book.binding(rootPath)

        if (spaceId) this.options.events.onBoard(this.boardIn(rootPath, spaceId))
      }
    }, 30)
  }

  private purgeExpired() {
    if (!this.synced) return

    const tree = new TrackerTree(this.book.records())
    const expired = expiredArchives(tree, this.now())

    if (expired.length === 0) return

    for (const id of expired) {
      for (const one of [id, ...tree.descendants(id)]) this.book.write(one, { deleted: true }, true)
    }

    this.book.commit()
  }
}
