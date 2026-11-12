import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * База статистики - SQLite из node:sqlite (встроен в Node Electron 44, без нативного модуля).
 * Почему не JSON, как остальное состояние IDE: статистика - сотни тысяч мелких записей и
 * выборки по периодам, проектам и источникам, а книгу в JSON пришлось бы читать целиком.
 *
 * Пишет и читает её один поток (scan-worker.ts): синхронные вызовы node:sqlite в главном
 * процессе останавливали бы окно на время выборки за год.
 *
 * Схема - номер версии в PRAGMA user_version и список шагов: новая версия - новый шаг в
 * конце MIGRATIONS, старые не правятся (у людей база уже на них).
 */

/**
 * Ключи записей - 53-битные хэши строковых id (сообщения, вызова инструмента): целое число
 * вдвое компактнее строки, а на миллион записей совпадение - доли процента от одного случая.
 *
 * Записи агентов (answers, edits, tool_calls, prompts, permissions) лежат по времени:
 * первичный ключ (ts, key) без rowid. Выборка за период читает таблицу подряд; при ключе-хэше
 * каждая строка периода была бы отдельным прыжком по таблице - сводка за месяц шла четверть
 * секунды на каждый запрос. Уникальность ключа держит свой индекс.
 *
 * places - папки, где шла работа (cwd транскрипта или проект окна), и проект, к которому
 * папка относится. Проект решает главный процесс (открытые проекты, worktree сценариев)
 * и может решить заново - записи хранят папку, а не проект.
 *
 * sessions - разговоры провайдера; ide_kind не пуст у тех, что запускала IDE (это и есть
 * «в IDE» фильтра).
 *
 * files - транскрипты: до какого байта прочитаны и что осталось от недочитанного отрезка
 * активности. Записи из транскриптов помнят свой файл: укоротившийся файл читается заново,
 * а его прежние записи стираются.
 *
 * spans - отрезки активности файла: записи не дальше IDLE_GAP_MS друг от друга и без
 * начала хода внутри. Из них и начал ходов складываются оценочные ходы (turns, exact = 0).
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
  CREATE TABLE places (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, project TEXT);
  CREATE INDEX places_project ON places(project);
  CREATE TABLE sessions (
    id INTEGER PRIMARY KEY, uuid TEXT NOT NULL UNIQUE, provider TEXT NOT NULL,
    ide_kind TEXT, ide_seen_at INTEGER
  );
  CREATE TABLE files (
    id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, size INTEGER NOT NULL,
    mtime_ms REAL NOT NULL, offset INTEGER NOT NULL, carry TEXT
  );
  CREATE TABLE answers (
    ts INTEGER NOT NULL, key INTEGER NOT NULL, file INTEGER, place INTEGER,
    session INTEGER NOT NULL, model TEXT NOT NULL, input INTEGER NOT NULL,
    output INTEGER NOT NULL, cache_read INTEGER NOT NULL, cache_write INTEGER NOT NULL,
    cache_write_1h INTEGER NOT NULL, fast INTEGER NOT NULL, cost REAL NOT NULL,
    subagent INTEGER NOT NULL, PRIMARY KEY (ts, key)
  ) WITHOUT ROWID;
  CREATE UNIQUE INDEX answers_key ON answers(key);
  CREATE INDEX answers_file ON answers(file);
  CREATE TABLE edits (
    ts INTEGER NOT NULL, key INTEGER NOT NULL, file INTEGER, place INTEGER,
    session INTEGER NOT NULL, tool TEXT NOT NULL, ext TEXT NOT NULL, file_hash INTEGER NOT NULL,
    added INTEGER NOT NULL, removed INTEGER NOT NULL, subagent INTEGER NOT NULL,
    PRIMARY KEY (ts, key)
  ) WITHOUT ROWID;
  CREATE UNIQUE INDEX edits_key ON edits(key);
  CREATE INDEX edits_file ON edits(file);
  CREATE TABLE tool_calls (
    ts INTEGER NOT NULL, key INTEGER NOT NULL, file INTEGER, place INTEGER,
    session INTEGER NOT NULL, tool TEXT NOT NULL, server TEXT, skip_edits INTEGER NOT NULL,
    subagent INTEGER NOT NULL, PRIMARY KEY (ts, key)
  ) WITHOUT ROWID;
  CREATE UNIQUE INDEX tool_calls_key ON tool_calls(key);
  CREATE INDEX tool_calls_file ON tool_calls(file);
  CREATE TABLE prompts (
    ts INTEGER NOT NULL, key INTEGER NOT NULL, file INTEGER, place INTEGER,
    session INTEGER NOT NULL, human INTEGER NOT NULL, PRIMARY KEY (ts, key)
  ) WITHOUT ROWID;
  CREATE UNIQUE INDEX prompts_key ON prompts(key);
  CREATE INDEX prompts_session ON prompts(session, ts);
  CREATE INDEX prompts_file ON prompts(file);
  CREATE TABLE permissions (
    ts INTEGER NOT NULL, key INTEGER NOT NULL, file INTEGER, place INTEGER,
    session INTEGER NOT NULL, decision TEXT NOT NULL, PRIMARY KEY (ts, key)
  ) WITHOUT ROWID;
  CREATE UNIQUE INDEX permissions_key ON permissions(key);
  CREATE INDEX permissions_file ON permissions(file);
  CREATE TABLE spans (
    file INTEGER NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL,
    session INTEGER NOT NULL, place INTEGER, PRIMARY KEY (file, start)
  ) WITHOUT ROWID;
  CREATE INDEX spans_session ON spans(session, start);
  CREATE TABLE turns (
    key TEXT PRIMARY KEY, session INTEGER NOT NULL, place INTEGER,
    started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL, work_ms INTEGER NOT NULL,
    exact INTEGER NOT NULL
  ) WITHOUT ROWID;
  CREATE INDEX turns_time ON turns(started_at, ended_at);
  CREATE INDEX turns_session ON turns(session, started_at);
  CREATE TABLE presence (minute INTEGER NOT NULL, place INTEGER NOT NULL, PRIMARY KEY (minute, place))
    WITHOUT ROWID;
  CREATE TABLE manual (
    minute INTEGER NOT NULL, place INTEGER NOT NULL, ext TEXT NOT NULL,
    typed INTEGER NOT NULL, pasted INTEGER NOT NULL, added INTEGER NOT NULL,
    removed INTEGER NOT NULL, PRIMARY KEY (minute, place, ext)
  ) WITHOUT ROWID;
  CREATE TABLE scenario_runs (
    run_id TEXT PRIMARY KEY, provider TEXT NOT NULL, place INTEGER, scenario TEXT NOT NULL,
    started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL, state TEXT NOT NULL,
    cost REAL NOT NULL, tokens INTEGER NOT NULL, active_ms INTEGER NOT NULL
  ) WITHOUT ROWID;
  CREATE INDEX scenario_runs_started ON scenario_runs(started_at);
  `,
]

/** Версия схемы, которую знает этот код. */
export const SCHEMA_VERSION = MIGRATIONS.length

const userVersion = (db: DatabaseSync): number => {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined

  return row?.user_version ?? 0
}

/** Довести схему до текущей версии; каждый шаг - своя транзакция. */
export const migrate = (db: DatabaseSync): void => {
  const from = userVersion(db)

  if (from > SCHEMA_VERSION) {
    // База от более новой IDE: писать в неё по старой схеме нельзя.
    throw new Error(`statistics.sqlite schema ${from} is newer than ${SCHEMA_VERSION}`)
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
 * Открыть базу: WAL (чтение не ждёт записи), synchronous NORMAL (в WAL это надёжно при
 * падении процесса, теряется разве что последняя транзакция при отказе питания - для
 * статистики, которая дочитается заново, это не беда).
 */
export const openStatsDb = (path: string): DatabaseSync => {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })

  const db = new DatabaseSync(path)

  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA busy_timeout = 5000')
  // Ключи - хэши, вставки ложатся в случайные места индексов: с кэшем по умолчанию (2 МБ)
  // первый проход по гигабайтам транскриптов упирался в чтение страниц с диска.
  db.exec('PRAGMA cache_size = -65536')
  db.exec('PRAGMA temp_store = MEMORY')
  db.exec('PRAGMA foreign_keys = OFF')
  migrate(db)

  return db
}

/**
 * Выполнить блок в транзакции; ошибка откатывает всё. Внутри уже открытой транзакции (кусок
 * прохода по транскриптам) - точкой сохранения: блок фиксируется вместе с ней.
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

export const readMeta = (db: DatabaseSync, key: string): string | null => {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    { value: string } | undefined

  return row?.value ?? null
}

export const writeMeta = (db: DatabaseSync, key: string, value: string): void => {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value)
}
