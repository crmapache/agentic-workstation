import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * База локальной истории (ADR 0045) - SQLite из node:sqlite, как статистика. Запросы мелкие
 * (событие, строка файла, одна версия), поэтому живут в главном процессе без своего потока;
 * сжатие версий - в пуле потоков zlib.
 *
 * roots - корни проектов: история принадлежит папке, а не id проекта в окне (закрыл и открыл
 * снова - история та же). scanned - первая полная сверка прошла: до неё незнакомый файл -
 * просто запоминается, после - это новый файл. seen_at - когда проект последний раз был
 * открыт: забытый на месяц уходит из базы целиком.
 *
 * files - каким история знает каждый файл сейчас: ключ содержимого и сведения с диска (размер,
 * время), чтобы сверка не читала неизменившееся. Это «до» следующего события файла.
 *
 * revisions - события: что было (previous) и что стало (version), когда, почему. started_at -
 * начало склеенной серии сохранений редактора. Путь - нынешний: перенос переписывает пути
 * старых событий, и история едет за файлом.
 *
 * blobs - содержимое версий, сжатое, по ключу, и когда оно легло. Только то, чего нет в git
 * проекта: ключ истории - ключ объекта git, закоммиченное отдаёт сам git.
 *
 * Схема - номер в PRAGMA user_version и список шагов, как у статистики: старые шаги не правятся.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE roots (
    id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, scanned INTEGER NOT NULL DEFAULT 0,
    seen_at INTEGER NOT NULL
  );
  CREATE TABLE files (
    root INTEGER NOT NULL, path TEXT NOT NULL, key TEXT NOT NULL, size INTEGER NOT NULL,
    mtime_ms REAL NOT NULL, PRIMARY KEY (root, path)
  ) WITHOUT ROWID;
  CREATE TABLE revisions (
    id INTEGER PRIMARY KEY, root INTEGER NOT NULL, path TEXT NOT NULL, at INTEGER NOT NULL,
    started_at INTEGER NOT NULL, cause TEXT NOT NULL, origin TEXT, version TEXT, previous TEXT
  );
  CREATE INDEX revisions_path ON revisions(root, path, at);
  CREATE INDEX revisions_at ON revisions(root, at);
  CREATE TABLE blobs (key TEXT NOT NULL UNIQUE, size INTEGER NOT NULL, data BLOB NOT NULL);
  `,
  // Когда содержимое легло в базу: уборка не трогает свежее - сверка сохраняет его раньше,
  // чем пишет ссылающиеся на него строки.
  `
  ALTER TABLE blobs ADD COLUMN kept_at INTEGER NOT NULL DEFAULT 0;
  `,
]

const SCHEMA_VERSION = MIGRATIONS.length

const userVersion = (db: DatabaseSync): number => {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined

  return row?.user_version ?? 0
}

const migrate = (db: DatabaseSync): void => {
  const from = userVersion(db)

  if (from > SCHEMA_VERSION) {
    throw new Error(`history.db schema ${from} is newer than ${SCHEMA_VERSION}`)
  }

  for (let version = from; version < SCHEMA_VERSION; version += 1) {
    db.exec('BEGIN IMMEDIATE')

    try {
      db.exec(MIGRATIONS[version] ?? '')
      db.exec(`PRAGMA user_version = ${version + 1}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}

/**
 * Открыть базу истории: WAL, synchronous NORMAL. Новая база - с постепенной уборкой места
 * (auto_vacuum INCREMENTAL): ушедшие за месяц версии возвращают диск без полного VACUUM. Это
 * ставится только до первой таблицы.
 */
export const openHistoryDb = (path: string): DatabaseSync => {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })

  const db = new DatabaseSync(path)

  try {
    if (userVersion(db) === 0) db.exec('PRAGMA auto_vacuum = INCREMENTAL')
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA synchronous = NORMAL')
    db.exec('PRAGMA busy_timeout = 5000')
    migrate(db)
  } catch (error) {
    db.close()
    throw error
  }

  return db
}

/**
 * Блок в транзакции; ошибка откатывает всё. Внутри уже открытой (перенос посреди сверки) -
 * точкой сохранения: блок фиксируется вместе с внешней.
 */
export const inTransaction = <T>(db: DatabaseSync, run: () => T): T => {
  const nested = db.isTransaction

  db.exec(nested ? 'SAVEPOINT block' : 'BEGIN')

  try {
    const result = run()

    db.exec(nested ? 'RELEASE block' : 'COMMIT')

    return result
  } catch (error) {
    if (nested) {
      db.exec('ROLLBACK TO block')
      db.exec('RELEASE block')
    } else db.exec('ROLLBACK')

    throw error
  }
}
