import type { DatabaseSync, StatementSync } from 'node:sqlite'

import type {
  PushRecord,
  PushResult,
  PullResponse,
  PushResponse,
  CloudErrorCode,
} from '@agentic-workstation/cloud-protocol/api'
import { PULL_PAGE } from '@agentic-workstation/cloud-protocol/api'

type Row = Record<string, unknown>

const num = (row: Row | undefined, column: string): number => Number(row?.[column] ?? 0)

const str = (row: Row, column: string): string => {
  const value = row[column]

  return typeof value === 'string' ? value : ''
}

/**
 * Время последнего входа аккаунта обновляется не чаще этого: забор встаёт заново каждые
 * полминуты, и запись на каждый был бы лишней нагрузкой ради числа, нужного раз в месяц.
 */
const SEEN_STEP_MS = 10 * 60_000

/** Отказ запроса целиком: код протокола и слова для журнала IDE. */
export class Refusal extends Error {
  readonly code: CloudErrorCode

  constructor(code: CloudErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/**
 * Записи аккаунтов. Версия (rev) - счётчик аккаунта: каждая принятая запись получает следующий
 * номер, поэтому «что нового после N» - один запрос по индексу (account, rev), а новейшая запись
 * всегда несёт номер аккаунта. Запись принимается, только если IDE правила версию, что лежит на
 * сервере (baseRev): иначе её правка затёрла бы чужую, которую она ещё не видела.
 */
export class Records {
  private readonly db: DatabaseSync
  private readonly maxRecords: number
  private readonly now: () => number
  private readonly insertAccount: StatementSync
  private readonly seeAccount: StatementSync
  private readonly account: StatementSync
  private readonly advance: StatementSync
  private readonly revOf: StatementSync
  private readonly upsert: StatementSync
  private readonly page: StatementSync

  constructor(db: DatabaseSync, options: { maxAccountRecords: number }, now = Date.now) {
    this.db = db
    this.maxRecords = options.maxAccountRecords
    this.now = now
    this.insertAccount = db.prepare(
      'INSERT OR IGNORE INTO accounts (key, created_at, seen_at) VALUES (?, ?, ?)',
    )
    this.seeAccount = db.prepare('UPDATE accounts SET seen_at = ? WHERE key = ? AND seen_at < ?')
    this.account = db.prepare('SELECT rev, records FROM accounts WHERE key = ?')
    this.advance = db.prepare('UPDATE accounts SET rev = ?, records = records + ? WHERE key = ?')
    this.revOf = db.prepare('SELECT rev FROM records WHERE account = ? AND id = ?')
    this.upsert = db.prepare(
      'INSERT INTO records (account, id, rev, blob, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (account, id) DO UPDATE SET rev = excluded.rev, blob = excluded.blob, updated_at = excluded.updated_at',
    )
    this.page = db.prepare(
      'SELECT id, rev, blob FROM records WHERE account = ? AND rev > ? ORDER BY rev LIMIT ?',
    )
  }

  /** Аккаунт по ключу подписи: первый подписанный запрос заводит его. true - заведён сейчас. */
  touch(key: string): boolean {
    const now = this.now()

    if (Number(this.insertAccount.run(key, now, now).changes) > 0) return true

    this.seeAccount.run(now, key, now - SEEN_STEP_MS)

    return false
  }

  /**
   * Принять пачку одной транзакцией: каждая запись по порядку сверяется с версией на сервере
   * (или с той, что дала ей эта же пачка). Пачка, которая перерастила бы аккаунт, отклоняется
   * целиком до записи - половина правок без второй половины хуже, чем ни одной.
   */
  push(key: string, records: readonly PushRecord[]): PushResponse {
    this.db.exec('BEGIN IMMEDIATE')

    try {
      const response = this.apply(key, records)

      this.db.exec('COMMIT')

      return response
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  /** Страница записей новее since по порядку версий; нет аккаунта - пусто с версией 0. */
  pull(key: string, since: number): PullResponse {
    const rows = this.page.all(key, since, PULL_PAGE + 1) as Row[]

    return {
      rev: num(this.account.get(key), 'rev'),
      records: rows.slice(0, PULL_PAGE).map((row) => ({
        id: str(row, 'id'),
        rev: num(row, 'rev'),
        blob: str(row, 'blob'),
      })),
      more: rows.length > PULL_PAGE,
    }
  }

  private apply(key: string, records: readonly PushRecord[]): PushResponse {
    const now = this.now()

    this.insertAccount.run(key, now, now)

    const account = this.account.get(key) as Row | undefined
    // Версии, которые дала эта же пачка: вторая запись того же id сверяется с первой.
    const known = new Map<string, number>()
    const writes: { id: string; rev: number; blob: string }[] = []
    const results: PushResult[] = []
    let rev = num(account, 'rev')
    let created = 0

    for (const record of records) {
      const current = known.get(record.id) ?? num(this.revOf.get(key, record.id), 'rev')

      if (record.baseRev !== current) {
        known.set(record.id, current)
        results.push({ id: record.id, ok: false, current })
        continue
      }

      rev += 1
      // Версии начинаются с 1: ноль значит, что записи с таким id у аккаунта ещё нет.
      if (current === 0) created += 1

      known.set(record.id, rev)
      writes.push({ id: record.id, rev, blob: record.blob })
      results.push({ id: record.id, ok: true, rev })
    }

    const total = num(account, 'records')

    if (created > 0 && total + created > this.maxRecords) {
      throw new Refusal(
        'account-full',
        `The account holds ${total} of ${this.maxRecords} records; this push adds ${created} more.`,
      )
    }

    for (const write of writes) this.upsert.run(key, write.id, write.rev, write.blob, now)

    if (writes.length > 0) this.advance.run(rev, created, key)

    return { rev, results }
  }
}
