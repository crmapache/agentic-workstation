import type { TrackerOp, TrackerBoard, TrackerOutcome } from '@shared/tracker'

import type { TrackerBook } from './tracker-book'
import { TrackerError } from './tracker-fields'
import { applyOp } from './tracker-ops'
import type { TrackerPlace } from './tracker-spaces'
import { readRemote, resolveSpace, mergeTwinSpaces } from './tracker-spaces'
import { TrackerTree } from './tracker-tree'
import type { RunStateOf } from './tracker-view'
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

  constructor(private readonly options: TrackerOptions) {
    this.now = options.now ?? Date.now
    this.remoteOf = options.remoteOf ?? readRemote
    options.book.onChange((change) => {
      if (change === 'remote') mergeTwinSpaces(options.book)

      this.scheduleRedraw()
    })
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

  /** Правка доски; отказ - кодом. */
  async apply(place: TrackerPlace, op: TrackerOp): Promise<TrackerOutcome> {
    const spaceId = await this.spaceOf(place)

    try {
      const done = applyOp({ book: this.book, spaceId, now: this.now() }, op)

      return { ok: true, board: this.boardIn(place.rootPath, spaceId), ...done }
    } catch (error) {
      if (error instanceof TrackerError) return { ok: false, code: error.code }

      throw error
    }
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
    return boardOf(
      new TrackerTree(this.book.records()),
      spaceId,
      rootPath,
      this.book.runs(),
      this.runStateOf,
    )
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
    const tree = new TrackerTree(this.book.records())
    const expired = expiredArchives(tree, this.now())

    if (expired.length === 0) return

    for (const id of expired) {
      for (const one of [id, ...tree.descendants(id)]) this.book.write(one, { deleted: true }, true)
    }

    this.book.commit()
  }
}
