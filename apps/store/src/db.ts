import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * База магазина - один файл SQLite в томе: издатели (ключи IDE), расширения, версии с текстом
 * пакета, установки, отзывы и жалобы. Один файл - одна копия для бэкапа.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS publishers (
  key TEXT PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS extensions (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL REFERENCES publishers(key),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  latest TEXT NOT NULL,
  readme TEXT NOT NULL,
  permissions TEXT NOT NULL,
  installs INTEGER NOT NULL DEFAULT 0,
  rating_sum INTEGER NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
  extension_id TEXT NOT NULL REFERENCES extensions(id),
  version TEXT NOT NULL,
  digest TEXT NOT NULL,
  size INTEGER NOT NULL,
  package TEXT NOT NULL,
  permissions TEXT NOT NULL,
  hosts TEXT NOT NULL,
  commands TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  PRIMARY KEY (extension_id, version)
);
CREATE TABLE IF NOT EXISTS installs (
  extension_id TEXT NOT NULL,
  key TEXT NOT NULL,
  version TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (extension_id, key)
);
CREATE TABLE IF NOT EXISTS reviews (
  extension_id TEXT NOT NULL,
  key TEXT NOT NULL,
  rating INTEGER NOT NULL,
  text TEXT NOT NULL,
  version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (extension_id, key)
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  extension_id TEXT NOT NULL,
  key TEXT NOT NULL,
  reason TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS extensions_updated ON extensions(updated_at);
CREATE INDEX IF NOT EXISTS reviews_extension ON reviews(extension_id, updated_at);
`

/** Открыть базу в папке данных (создать, если её нет) - с журналом WAL и внешними ключами. */
export const openDatabase = (dataDir: string): DatabaseSync => {
  if (dataDir !== ':memory:') mkdirSync(dataDir, { recursive: true })

  const db = new DatabaseSync(dataDir === ':memory:' ? ':memory:' : join(dataDir, 'store.db'))

  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
  db.exec(SCHEMA)

  return db
}
