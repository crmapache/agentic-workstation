import type { DatabaseSync, StatementSync } from 'node:sqlite'

import type {
  PushRecord,
  PushResult,
  PulledRecord,
  PullResponse,
  PushResponse,
} from '@agentic-workstation/cloud-protocol/api'
import { PULL_PAGE } from '@agentic-workstation/cloud-protocol/api'

import { Refusal } from './replies.ts'

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

export type RecordLimits = {
  /** Потолок записей аккаунта. */
  maxAccountRecords: number
  /** Потолок суммы длин шифра аккаунта. */
  maxAccountBytes: number
  /** Сколько знаков шифра в одной странице забора. */
  pullPageBytes: number
}

/** Версия записи на сервере и длина её шифра; ноль - записи с таким id нет. */
type Held = { rev: number; size: number }

/**
 * Записи аккаунтов. Версия (rev) - счётчик аккаунта: каждая принятая запись получает следующий
 * номер, поэтому «что нового после N» - один запрос по индексу (account, rev), а новейшая запись
 * всегда несёт номер аккаунта. Запись принимается, только если IDE правила версию, что лежит на
 * сервере (baseRev): иначе её правка затёрла бы чужую, которую она ещё не видела.
 *
 * Аккаунт - строка в базе - появляется только с первой принятой записью: ключи бесплатны, и
 * заводи сервер аккаунт на любой подписанный запрос, забор с миллиона свежих ключей забил бы
 * диск пустыми строками.
 */
export class Records {
  private readonly db: DatabaseSync
  private readonly limits: RecordLimits
  private readonly now: () => number
  private readonly insertAccount: StatementSync
  private readonly seeAccount: StatementSync
  private readonly account: StatementSync
  private readonly advance: StatementSync
  private readonly heldOf: StatementSync
  private readonly upsert: StatementSync
  private readonly page: StatementSync

  constructor(db: DatabaseSync, limits: RecordLimits, now = Date.now) {
    this.db = db
    this.limits = limits
    this.now = now
    this.insertAccount = db.prepare(
      'INSERT INTO accounts (key, created_at, seen_at) VALUES (?, ?, ?)',
    )
    this.seeAccount = db.prepare('UPDATE accounts SET seen_at = ? WHERE key = ? AND seen_at < ?')
    this.account = db.prepare('SELECT rev, records, bytes FROM accounts WHERE key = ?')
    this.advance = db.prepare(
      'UPDATE accounts SET rev = ?, records = records + ?, bytes = bytes + ?, seen_at = ? WHERE key = ?',
    )
    this.heldOf = db.prepare(
      'SELECT rev, length(blob) AS size FROM records WHERE account = ? AND id = ?',
    )
    this.upsert = db.prepare(
      'INSERT INTO records (account, id, rev, blob, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (account, id) DO UPDATE SET rev = excluded.rev, blob = excluded.blob, updated_at = excluded.updated_at',
    )
    this.page = db.prepare(
      'SELECT id, rev, blob FROM records WHERE account = ? AND rev > ? ORDER BY rev LIMIT ?',
    )
  }

  /** Отметить вход аккаунта, если он есть; нового не заводит. */
  see(key: string): void {
    const now = this.now()

    this.seeAccount.run(now, key, now - SEEN_STEP_MS)
  }

  /**
   * Принять пачку одной транзакцией: каждая запись по порядку сверяется с версией на сервере
   * (или с той, что дала ей эта же пачка). Пачка, которая перерастила бы аккаунт по числу или
   * по месту, отклоняется целиком до записи - половина правок без второй половины хуже, чем ни
   * одной. admitNew зовётся, только когда пачка заводит аккаунт (первая принятая запись), и
   * отказывает исключением Refusal; created - аккаунт заведён сейчас.
   */
  push(
    key: string,
    records: readonly PushRecord[],
    admitNew: () => void,
  ): { response: PushResponse; created: boolean } {
    this.db.exec('BEGIN IMMEDIATE')

    try {
      const result = this.apply(key, records, admitNew)

      this.db.exec('COMMIT')

      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  /**
   * Страница записей новее since по порядку версий; нет аккаунта - пусто с версией 0, без записи
   * в базу. Страница режется и по числу, и по знакам шифра (хотя бы одна запись): blob до 96 КиБ,
   * и 500 таких - полсотни мегабайт в памяти и в ответе. Строки читаются по одной, чтобы лишние
   * blob не поднимались из базы вовсе.
   */
  pull(key: string, since: number): PullResponse {
    const rev = num(this.account.get(key), 'rev')
    const records: PulledRecord[] = []
    let size = 0
    let more = false

    for (const row of this.page.iterate(key, since, PULL_PAGE + 1) as Iterable<Row>) {
      const blob = str(row, 'blob')

      if (
        records.length === PULL_PAGE ||
        (records.length > 0 && size + blob.length > this.limits.pullPageBytes)
      ) {
        more = true
        break
      }

      size += blob.length
      records.push({ id: str(row, 'id'), rev: num(row, 'rev'), blob })
    }

    return { rev, records, more }
  }

  private apply(
    key: string,
    records: readonly PushRecord[],
    admitNew: () => void,
  ): { response: PushResponse; created: boolean } {
    const now = this.now()
    const account = this.account.get(key) as Row | undefined
    // Что дала эта же пачка: вторая запись того же id сверяется с первой.
    const known = new Map<string, Held>()
    const writes: { id: string; rev: number; blob: string }[] = []
    const results: PushResult[] = []
    let rev = num(account, 'rev')
    let added = 0
    let grown = 0

    for (const record of records) {
      const held = known.get(record.id) ?? this.held(key, record.id)

      if (record.baseRev !== held.rev) {
        known.set(record.id, held)
        results.push({ id: record.id, ok: false, current: held.rev })
        continue
      }

      rev += 1
      // Версии начинаются с 1: ноль значит, что записи с таким id у аккаунта ещё нет.
      if (held.rev === 0) added += 1

      grown += record.blob.length - held.size
      known.set(record.id, { rev, size: record.blob.length })
      writes.push({ id: record.id, rev, blob: record.blob })
      results.push({ id: record.id, ok: true, rev })
    }

    const response = { rev, results }

    // Ничего не принято - писать нечего, и аккаунт (если его нет) не заводится.
    if (writes.length === 0) return { response, created: false }

    this.checkRoom(num(account, 'records'), added, num(account, 'bytes'), grown)

    const created = account === undefined

    if (created) {
      admitNew()
      this.insertAccount.run(key, now, now)
    }

    for (const write of writes) this.upsert.run(key, write.id, write.rev, write.blob, now)

    this.advance.run(rev, added, grown, now, key)

    return { response, created }
  }

  private held(key: string, id: string): Held {
    const row = this.heldOf.get(key, id) as Row | undefined

    return { rev: num(row, 'rev'), size: num(row, 'size') }
  }

  /**
   * Потолки аккаунта. Отказ - только если пачка растит аккаунт за потолок: правка, которая не
   * добавляет записей и не удлиняет шифр, проходит и у полного аккаунта (иначе он застыл бы).
   */
  private checkRoom(records: number, added: number, bytes: number, grown: number) {
    const { maxAccountRecords, maxAccountBytes } = this.limits

    if (added > 0 && records + added > maxAccountRecords) {
      throw new Refusal(
        'account-full',
        `The account holds ${records} of ${maxAccountRecords} records; this push adds ${added} more.`,
      )
    }

    if (grown > 0 && bytes + grown > maxAccountBytes) {
      throw new Refusal(
        'account-full',
        `The account holds ${bytes} of ${maxAccountBytes} bytes; this push adds ${grown} more.`,
      )
    }
  }
}
