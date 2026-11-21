import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * База облака - один файл SQLite в томе: аккаунты (открытый ключ подписи, счётчик версий, число
 * записей) и записи шифром. Ни имён, ни почты, ни содержимого - сервер видит только непрозрачный
 * blob под случайным id. Один файл - одна копия для бэкапа.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  key TEXT PRIMARY KEY,
  rev INTEGER NOT NULL DEFAULT 0,
  records INTEGER NOT NULL DEFAULT 0,
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

/** Файл базы в папке данных: его же снимает бэкап (backup.ts). */
export const DATABASE_FILE = 'cloud.db'

/** Открыть базу в папке данных (создать, если её нет) - с журналом WAL и внешними ключами. */
export const openDatabase = (dataDir: string): DatabaseSync => {
  mkdirSync(dataDir, { recursive: true })

  const db = new DatabaseSync(join(dataDir, DATABASE_FILE))

  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
  db.exec(SCHEMA)

  return db
}
