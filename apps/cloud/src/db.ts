import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * База облака - один файл SQLite в томе: аккаунты (открытый ключ подписи, счётчик версий, число
 * записей и сумма длин шифра) и записи шифром. Ни имён, ни почты, ни содержимого - сервер видит
 * только непрозрачный blob под случайным id. Один файл - одна копия для бэкапа.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  key TEXT PRIMARY KEY,
  rev INTEGER NOT NULL DEFAULT 0,
  records INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS records (
  account TEXT NOT NULL REFERENCES accounts(key),
  id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  blob TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account, id)
);
CREATE INDEX IF NOT EXISTS records_account_rev ON records(account, rev);
`

/** Версия схемы в PRAGMA user_version: по ней база, заведённая прежним сервером, догоняет новую. */
const SCHEMA_VERSION = 1

/** Файл базы в папке данных: его же снимает бэкап (backup.ts). */
export const DATABASE_FILE = 'cloud.db'

/**
 * Догнать базу прежнего сервера одной транзакцией. Версия 1: у аккаунта появилась сумма длин
 * шифра (потолок места аккаунта) - она считается по уже лежащим записям; аккаунты без единой
 * принятой записи уходят - прежний сервер заводил их на любой подписанный запрос, и это был
 * способ забить диск пустыми строками.
 */
const migrate = (db: DatabaseSync) => {
  const version = Number((db.prepare('PRAGMA user_version').get() ?? {})['user_version'] ?? 0)

  if (version >= SCHEMA_VERSION) return

  const columns = db
    .prepare('PRAGMA table_info(accounts)')
    .all()
    .map((column) => column['name'])

  db.exec('BEGIN IMMEDIATE')

  try {
    if (!columns.includes('bytes')) {
      db.exec('ALTER TABLE accounts ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0')
      db.exec(
        'UPDATE accounts SET bytes = (SELECT COALESCE(SUM(LENGTH(blob)), 0) FROM records WHERE records.account = accounts.key)',
      )
    }

    db.exec(
      'DELETE FROM accounts WHERE rev = 0 AND NOT EXISTS (SELECT 1 FROM records WHERE records.account = accounts.key)',
    )
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/** Открыть базу в папке данных (создать, если её нет) - с журналом WAL и внешними ключами. */
export const openDatabase = (dataDir: string): DatabaseSync => {
  mkdirSync(dataDir, { recursive: true })

  const db = new DatabaseSync(join(dataDir, DATABASE_FILE))

  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
  db.exec(SCHEMA)
  migrate(db)

  return db
}
