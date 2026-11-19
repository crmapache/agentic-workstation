import { statSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import type { StatementSync } from 'node:sqlite'

import type { StatsStore } from '../stats-store'
import { OPENCODE_PAGE_ROWS, OPENCODE_REREAD_MS } from '../stats.constants'
import type { TimedBatch } from '../timed-batch'
import type { RowWriter } from '../transcripts/row-writer'
import type { OpenCodeMessage } from './opencode-rows'
import { openCodeRowsOf } from './opencode-rows'

type MessageRow = {
  rowid: number
  id: string
  session_id: string
  type: string
  time_created: number
  time_updated: number
  data: string
}

type SessionRow = { id: string; parent_id: string | null; directory: string }

/** Таблицы схемы OpenCode 2.3.x, которые читает статистика. */
const REQUIRED_TABLES = ['session_v2', 'session_message']

/** Глубже субагенты не вкладываются; глубже - петля в битой базе. */
const MAX_DEPTH = 32

/** Сессия сообщения: корень (у субагента - кто позвал) и папка. */
type SessionPlace = { root: string; subagent: boolean; cwd: string }

const sessionPlaces = (rows: readonly SessionRow[]): Map<string, SessionPlace> => {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const places = new Map<string, SessionPlace>()

  for (const row of rows) {
    let root = row
    let depth = 0

    while (root.parent_id && depth < MAX_DEPTH) {
      const parent = byId.get(root.parent_id)

      if (!parent) break

      root = parent
      depth += 1
    }

    places.set(row.id, { root: root.id, subagent: row.parent_id !== null, cwd: row.directory })
  }

  return places
}

const parseData = (text: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(text)

    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * Разговоры OpenCode - не JSONL, а его база SQLite (`$XDG_DATA_HOME/opencode/opencode.db`): у
 * IDE своя в userData, у человека - своя. База чужая и живая: открывается только на чтение,
 * на время одного прохода, и всё, что не прочиталось (занята, нет файла, другая схема), просто
 * ждёт следующего прохода - поток статистики из-за неё не падает.
 *
 * Дочитывание - по времени правки сообщения (`time_updated`): ответ модели пишется кусками и
 * правится, пока идёт. Смещение «файла» базы в files.offset - самое позднее прочитанное время;
 * следующий проход берёт с запасом OPENCODE_REREAD_MS назад (правки в одну миллисекунду с
 * последней прочитанной), а запись всех строк идемпотентна: ключи - id сообщений и вызовов.
 */
export class OpenCodeSource {
  private readonly selectFile: StatementSync
  private readonly insertFile: StatementSync
  private readonly updateFile: StatementSync
  /** О базе с чужой схемой говорится в журнал один раз, а не каждую минуту. */
  private readonly warned = new Set<string>()

  constructor(
    private readonly store: StatsStore,
    private readonly writer: RowWriter,
  ) {
    const db = store.db

    this.selectFile = db.prepare('SELECT id, offset FROM files WHERE path = ?')
    this.insertFile = db.prepare(
      'INSERT INTO files (path, size, mtime_ms, offset) VALUES (?, ?, ?, 0) RETURNING id, offset',
    )
    this.updateFile = db.prepare('UPDATE files SET size = ?, mtime_ms = ?, offset = ? WHERE id = ?')
  }

  /** Дочитать базу; ответ - пришло ли новое. */
  async read(path: string, batch: TimedBatch, touched: Set<number>): Promise<boolean> {
    const info = statSync(path, { throwIfNoEntry: false })

    if (!info?.isFile()) return false

    let source: DatabaseSync | null = null

    try {
      source = new DatabaseSync(path, { readOnly: true })
      source.exec('PRAGMA busy_timeout = 1000')

      return await this.readOpen(source, path, info, batch, touched)
    } catch (error) {
      console.warn('[statistics] OpenCode database was not read', path, error)
      this.store.resetCache()

      return false
    } finally {
      source?.close()
    }
  }

  private async readOpen(
    source: DatabaseSync,
    path: string,
    info: { size: number; mtimeMs: number },
    batch: TimedBatch,
    touched: Set<number>,
  ): Promise<boolean> {
    if (!this.knowsSchema(source, path)) return false

    const last = (
      source.prepare('SELECT MAX(time_updated) AS at FROM session_message').get() as {
        at: number | null
      }
    ).at
    const file = batch.step(
      () =>
        (this.selectFile.get(path) ?? this.insertFile.get(path, info.size, info.mtimeMs)) as {
          id: number
          offset: number
        },
    )

    if (last === null || last === file.offset) return false

    // База моложе прочитанного (её стёрли и завели заново) - читается с начала.
    const from = last < file.offset ? 0 : Math.max(0, file.offset - OPENCODE_REREAD_MS)
    const places = sessionPlaces(
      source.prepare('SELECT id, parent_id, directory FROM session_v2').all() as SessionRow[],
    )
    const page = source.prepare(
      `SELECT rowid, id, session_id, type, time_created, time_updated, data FROM session_message
       WHERE time_updated > :at OR (time_updated = :at AND rowid > :rowid)
       ORDER BY time_updated, rowid LIMIT ${OPENCODE_PAGE_ROWS}`,
    )
    let cursor = { at: from - 1, rowid: Number.MAX_SAFE_INTEGER }
    let mark = file.offset

    for (;;) {
      const rows = page.all(cursor) as MessageRow[]
      const tail = rows.at(-1)

      if (!tail) break

      mark = Math.max(mark, tail.time_updated)
      batch.step(() => {
        for (const row of rows) {
          const message = this.messageOf(row, places)

          if (!message) continue

          for (const session of this.writer.write(file.id, openCodeRowsOf(message), 'opencode')) {
            touched.add(session)
          }
        }

        this.updateFile.run(info.size, info.mtimeMs, mark, file.id)
      })
      cursor = { at: tail.time_updated, rowid: tail.rowid }
      await batch.breathe()

      if (rows.length < OPENCODE_PAGE_ROWS) break
    }

    return true
  }

  private knowsSchema(source: DatabaseSync, path: string): boolean {
    const tables = new Set(
      (
        source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
          name: string
        }[]
      ).map((row) => row.name),
    )
    const known = REQUIRED_TABLES.every((table) => tables.has(table))

    if (!known && !this.warned.has(path)) {
      this.warned.add(path)
      console.warn('[statistics] OpenCode database has an unknown schema, skipped', path)
    }

    return known
  }

  /** Строка базы - сообщением разбора; сессии нет или data не JSON - пропуск. */
  private messageOf(row: MessageRow, places: Map<string, SessionPlace>): OpenCodeMessage | null {
    const place = places.get(row.session_id)
    const data = parseData(row.data)

    if (!place || !data) return null

    return {
      id: row.id,
      type: row.type,
      session: place.root,
      subagent: place.subagent,
      cwd: place.cwd,
      created: row.time_created,
      updated: row.time_updated,
      data,
    }
  }
}
