import type { DatabaseSync } from 'node:sqlite'

import type { HistoryCause } from '@shared/local-history'

import { inTransaction } from './history-db'

/** Каким история знает файл сейчас: ключ содержимого и сведения с диска на тот момент. */
export type FileRow = { path: string; key: string; size: number; mtimeMs: number }

/** Событие истории, как лежит в базе. */
export type RevisionRow = {
  id: number
  path: string
  at: number
  startedAt: number
  cause: HistoryCause
  origin: string | null
  version: string | null
  previous: string | null
}

/** Строки таблиц, как их отдаёт node:sqlite. */
type FileDbRow = { path: string; key: string; size: number; mtime_ms: number }

type RevisionDbRow = {
  id: number
  root: number
  path: string
  at: number
  started_at: number
  cause: HistoryCause
  origin: string | null
  version: string | null
  previous: string | null
}

const fileOf = (row: FileDbRow): FileRow => ({
  path: row.path,
  key: row.key,
  size: row.size,
  mtimeMs: row.mtime_ms,
})

const revisionOf = ({
  started_at: startedAt,
  root: _root,
  ...row
}: RevisionDbRow): RevisionRow => ({
  ...row,
  startedAt,
})

/**
 * Пути в папке: она сама и всё под ней. Диапазоном, а не LIKE: «%» и «_» в именах файлов -
 * не шаблон. Всё, что начинается с «папка/», лежит между «папка/» и «папка0» («0» идёт за «/»).
 */
const UNDER = '(path = ? OR (path >= ? AND path < ?))'

const underArgs = (folder: string) => [folder, `${folder}/`, `${folder}0`]

/** Запросы к базе истории (history-db.ts). Синхронные: каждый - доли миллисекунды. */
export class HistoryStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Корень проекта: известный или новый; открыт сейчас - помечается увиденным. */
  root(path: string, now: number): { id: number; scanned: boolean } {
    this.db
      .prepare(
        'INSERT INTO roots (path, seen_at) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET seen_at = excluded.seen_at',
      )
      .run(path, now)

    const row = this.db.prepare('SELECT id, scanned FROM roots WHERE path = ?').get(path) as {
      id: number
      scanned: number
    }

    return { id: row.id, scanned: row.scanned === 1 }
  }

  markScanned(root: number): void {
    this.db.prepare('UPDATE roots SET scanned = 1 WHERE id = ?').run(root)
  }

  /** Открытые проекты живы: месячная уборка не уносит проект, который просто долго открыт. */
  touchRoots(roots: readonly number[], now: number): void {
    const touch = this.db.prepare('UPDATE roots SET seen_at = ? WHERE id = ?')

    inTransaction(this.db, () => roots.forEach((root) => touch.run(now, root)))
  }

  files(root: number): Map<string, FileRow> {
    const rows = this.db.prepare('SELECT * FROM files WHERE root = ?').all(root) as FileDbRow[]

    return new Map(rows.map((row) => [row.path, fileOf(row)]))
  }

  file(root: number, path: string): FileRow | null {
    const row = this.db
      .prepare('SELECT * FROM files WHERE root = ? AND path = ?')
      .get(root, path) as FileDbRow | undefined

    return row ? fileOf(row) : null
  }

  /** Файлы в папке и под ней - или сам файл, если путь - файл. */
  filesUnder(root: number, folder: string): FileRow[] {
    const rows = this.db
      .prepare(`SELECT * FROM files WHERE root = ? AND ${UNDER}`)
      .all(root, ...underArgs(folder)) as FileDbRow[]

    return rows.map(fileOf)
  }

  putFile(root: number, { path, key, size, mtimeMs }: FileRow): void {
    this.db
      .prepare(
        `INSERT INTO files (root, path, key, size, mtime_ms) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(root, path) DO UPDATE SET key = excluded.key, size = excluded.size,
         mtime_ms = excluded.mtime_ms`,
      )
      .run(root, path, key, size, mtimeMs)
  }

  dropFile(root: number, path: string): void {
    this.db.prepare('DELETE FROM files WHERE root = ? AND path = ?').run(root, path)
  }

  latest(root: number, path: string): RevisionRow | null {
    const row = this.db
      .prepare('SELECT * FROM revisions WHERE root = ? AND path = ? ORDER BY at DESC, id DESC')
      .get(root, path) as RevisionDbRow | undefined

    return row ? revisionOf(row) : null
  }

  addRevision(root: number, revision: Omit<RevisionRow, 'id'>): void {
    const { path, at, startedAt, cause, origin, version, previous } = revision

    this.db
      .prepare(
        `INSERT INTO revisions (root, path, at, started_at, cause, origin, version, previous)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(root, path, at, startedAt, cause, origin, version, previous)
  }

  /** Серия сохранений редактора выросла: та же версия «до», новая «после». */
  extendRevision(id: number, version: string, at: number): void {
    this.db.prepare('UPDATE revisions SET version = ?, at = ? WHERE id = ?').run(version, at, id)
  }

  /** «До» события стало известно позже (правка агента, снимок которой опоздал). */
  setPrevious(id: number, previous: string): void {
    this.db.prepare('UPDATE revisions SET previous = ? WHERE id = ?').run(previous, id)
  }

  deleteRevision(id: number): void {
    this.db.prepare('DELETE FROM revisions WHERE id = ?').run(id)
  }

  /**
   * Файл или папку перенесли: строки файлов и события едут на новое место. Ответ - пары
   * «было - стало» перенесённых файлов. Строки на новом месте (остались от удалённого там
   * когда-то файла) уступают: файл там теперь этот.
   */
  moveTree(root: number, from: string, to: string): { from: string; row: FileRow }[] {
    const moved = (path: string) => `${to}${path.slice(from.length)}`

    return inTransaction(this.db, () => {
      const rows = this.filesUnder(root, from)
      const revisions = this.db
        .prepare(`SELECT id, path FROM revisions WHERE root = ? AND ${UNDER}`)
        .all(root, ...underArgs(from)) as { id: number; path: string }[]
      const setPath = this.db.prepare('UPDATE revisions SET path = ? WHERE id = ?')

      for (const row of rows) this.dropFile(root, row.path)
      for (const row of rows) this.putFile(root, { ...row, path: moved(row.path) })
      for (const revision of revisions) {
        setPath.run(moved(revision.path), revision.id)
      }

      return rows.map((row) => ({ from: row.path, row: { ...row, path: moved(row.path) } }))
    })
  }

  /** События файла или всего в папке ('' - весь проект), новые сверху, не больше limit. */
  list(root: number, path: string, limit: number): RevisionRow[] {
    const rows =
      path === ''
        ? this.db
            .prepare('SELECT * FROM revisions WHERE root = ? ORDER BY at DESC, id DESC LIMIT ?')
            .all(root, limit)
        : this.db
            .prepare(
              `SELECT * FROM revisions WHERE root = ? AND ${UNDER} ORDER BY at DESC, id DESC LIMIT ?`,
            )
            .all(root, ...underArgs(path), limit)

    return (rows as RevisionDbRow[]).map(revisionOf)
  }

  /** Ключ из истории этого проекта (событие или нынешнее содержимое файла)? */
  refers(root: number, key: string): boolean {
    const revision = this.db
      .prepare('SELECT 1 FROM revisions WHERE root = ? AND (version = ? OR previous = ?) LIMIT 1')
      .get(root, key, key)
    const file = this.db
      .prepare('SELECT 1 FROM files WHERE root = ? AND key = ? LIMIT 1')
      .get(root, key)

    return revision !== undefined || file !== undefined
  }

  hasBlob(key: string): boolean {
    return this.db.prepare('SELECT 1 FROM blobs WHERE key = ?').get(key) !== undefined
  }

  putBlob(key: string, size: number, packed: Buffer, now: number): void {
    this.db
      .prepare(
        'INSERT INTO blobs (key, size, data, kept_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO NOTHING',
      )
      .run(key, size, packed, now)
  }

  /** Содержимое снова нужно: уборка отсчитывает свежесть от этого момента. */
  touchBlob(key: string, now: number): void {
    this.db.prepare('UPDATE blobs SET kept_at = ? WHERE key = ?').run(now, key)
  }

  blob(key: string): { size: number; packed: Uint8Array } | null {
    const row = this.db.prepare('SELECT size, data FROM blobs WHERE key = ?').get(key) as
      { size: number; data: Uint8Array } | undefined

    return row ? { size: row.size, packed: row.data } : null
  }

  /**
   * Выбросить устаревшее: события старше before, проекты, не открывавшиеся с before, и
   * содержимое, на которое больше никто не ссылается и которое легло раньше keptBefore (свежее
   * сверка могла сохранить, но ещё не записать ссылки на него). Место возвращается постепенно.
   */
  purge(before: number, keptBefore: number): void {
    inTransaction(this.db, () => {
      this.db.prepare('DELETE FROM revisions WHERE at < ?').run(before)
      this.db
        .prepare('DELETE FROM revisions WHERE root IN (SELECT id FROM roots WHERE seen_at < ?)')
        .run(before)
      this.db
        .prepare('DELETE FROM files WHERE root IN (SELECT id FROM roots WHERE seen_at < ?)')
        .run(before)
      this.db.prepare('DELETE FROM roots WHERE seen_at < ?').run(before)
      this.db
        .prepare(
          `DELETE FROM blobs WHERE kept_at < ? AND
             key NOT IN (SELECT version FROM revisions WHERE version IS NOT NULL) AND
             key NOT IN (SELECT previous FROM revisions WHERE previous IS NOT NULL) AND
             key NOT IN (SELECT key FROM files)`,
        )
        .run(keptBefore)
    })
    this.db.exec('PRAGMA incremental_vacuum')
  }

  transaction<T>(run: () => T): T {
    return inTransaction(this.db, run)
  }

  close(): void {
    this.db.close()
  }
}
