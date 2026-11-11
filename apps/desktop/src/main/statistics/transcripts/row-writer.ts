import type { StatementSync } from 'node:sqlite'

import { costOf } from '../pricing'
import { keyOf } from '../stats-keys'
import type { StatsStore } from '../stats-store'
import { TRANSCRIPT_PROVIDER } from '../stats.constants'
import type { CopyTable, KnownTool, ParsedRows } from './parsed-rows'

/** Таблицы, где записи помнят свой транскрипт: укоротившийся файл стирает их. */
const FILE_TABLES = ['answers', 'edits', 'tool_calls', 'prompts', 'permissions', 'spans'] as const

/**
 * Запись разобранного транскрипта в базу. Вызывающий держит транзакцию: строки и смещение
 * файла пишутся вместе, так что оборванный проход не задвоит и не потеряет записей.
 *
 * Ответ пишется «по наибольшему»: его строки могли попасть в разные проходы. Остальное -
 * «первый прочитанный», ключи - id CLI (вызов, uuid), копии из форков совпадают с ними.
 */
export class RowWriter {
  private readonly answer: StatementSync
  private readonly edit: StatementSync
  private readonly toolCall: StatementSync
  private readonly prompt: StatementSync
  private readonly permission: StatementSync
  private readonly span: StatementSync
  private readonly owners: Record<CopyTable, StatementSync>
  private readonly tool: StatementSync

  constructor(private readonly store: StatsStore) {
    const db = store.db

    this.answer = db.prepare(`
      INSERT INTO answers (key, file, ts, place, session, model, input, output, cache_read,
        cache_write, cache_write_1h, fast, cost, subagent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET ts = min(ts, excluded.ts),
        input = max(input, excluded.input), output = max(output, excluded.output),
        cache_read = max(cache_read, excluded.cache_read),
        cache_write = max(cache_write, excluded.cache_write),
        cache_write_1h = max(cache_write_1h, excluded.cache_write_1h),
        fast = max(fast, excluded.fast), cost = max(cost, excluded.cost)`)
    this.edit = db.prepare(`
      INSERT INTO edits (key, file, ts, place, session, tool, ext, file_hash, added, removed, subagent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO NOTHING`)
    this.toolCall = db.prepare(`
      INSERT INTO tool_calls (key, file, ts, place, session, tool, server, skip_edits, subagent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO NOTHING`)
    this.prompt = db.prepare(`
      INSERT INTO prompts (key, file, ts, place, session, human) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO NOTHING`)
    this.permission = db.prepare(`
      INSERT INTO permissions (key, file, ts, place, session, decision) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO NOTHING`)
    this.span = db.prepare(`
      INSERT INTO spans (file, start, end, session, place) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(file, start) DO UPDATE SET end = max(end, excluded.end)`)
    this.owners = {
      answers: db.prepare('SELECT file FROM answers WHERE key = ?'),
      prompts: db.prepare('SELECT file FROM prompts WHERE key = ?'),
      tool_calls: db.prepare('SELECT file FROM tool_calls WHERE key = ?'),
    }
    this.tool = db.prepare('SELECT tool, skip_edits FROM tool_calls WHERE key = ?')
  }

  /** Записать строки файла; ответ - сессии, чьи ходы надо пересчитать. */
  write(file: number, rows: ParsedRows): Set<number> {
    const touched = new Set<number>()
    const place = (cwd: string) => this.store.placeId(cwd)
    const session = (uuid: string) => this.store.sessionId(uuid, TRANSCRIPT_PROVIDER)

    for (const row of rows.answers) {
      this.answer.run(
        row.key,
        file,
        row.ts,
        place(row.cwd),
        session(row.session),
        row.model,
        row.input,
        row.output,
        row.cacheRead,
        row.cacheWrite,
        row.cacheWrite1h,
        row.fast ? 1 : 0,
        costOf(row.model, row),
        row.subagent ? 1 : 0,
      )
    }

    for (const row of rows.edits) {
      this.edit.run(
        row.key,
        file,
        row.ts,
        place(row.cwd),
        session(row.session),
        row.tool,
        row.ext,
        row.fileHash,
        row.added,
        row.removed,
        row.subagent ? 1 : 0,
      )
    }

    for (const row of rows.toolCalls) {
      this.toolCall.run(
        row.key,
        file,
        row.ts,
        place(row.cwd),
        session(row.session),
        row.tool,
        row.server,
        row.skipEdits ? 1 : 0,
        row.subagent ? 1 : 0,
      )
    }

    for (const row of rows.prompts) {
      const id = session(row.session)

      this.prompt.run(row.key, file, row.ts, place(row.cwd), id, row.human ? 1 : 0)
      touched.add(id)
    }

    for (const row of rows.permissions) {
      this.permission.run(row.key, file, row.ts, place(row.cwd), session(row.session), row.decision)
    }

    for (const row of rows.spans) {
      const id = session(row.session)

      this.span.run(file, row.start, row.end, id, place(row.cwd))
      touched.add(id)
    }

    return touched
  }

  /** Запись с этим ключом уже прочитана из другого файла - копия форка. */
  isCopy(file: number, table: CopyTable, key: number): boolean {
    const row = this.owners[table].get(key) as { file: number | null } | undefined

    return row !== undefined && row.file !== null && row.file !== file
  }

  /** Вызов из прошлого прохода: имя и не правки ли это git/форматтера. */
  knownTool(id: string): KnownTool | null {
    const row = this.tool.get(keyOf(id)) as { tool: string; skip_edits: number } | undefined

    return row ? { name: row.tool, skipEdits: row.skip_edits === 1 } : null
  }

  /** Стереть всё прочитанное из файла (он укоротился); ответ - сессии его отрезков. */
  dropFile(file: number): Set<number> {
    const db = this.store.db
    const sessions = db.prepare('SELECT DISTINCT session FROM spans WHERE file = ?').all(file) as {
      session: number
    }[]

    for (const table of FILE_TABLES) db.prepare(`DELETE FROM ${table} WHERE file = ?`).run(file)

    return new Set(sessions.map((row) => row.session))
  }
}
