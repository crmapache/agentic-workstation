import type { DatabaseSync } from 'node:sqlite'

import type { StatsFilter, StatsPeriod, StatsReport, StatsScanProgress } from '@shared/statistics'

import { costOf, PRICES_VERSION } from './pricing'
import { readMeta, writeMeta, openStatsDb, inTransaction } from './stats-db'
import { StatsStore } from './stats-store'
import type { LiveNote } from './live/live-notes'
import { LiveNotes } from './live/live-notes'
import { buildReport } from './queries/stats-report'
import type { ScanResult } from './transcripts/transcript-scanner'
import { TranscriptScanner } from './transcripts/transcript-scanner'

/** Папка, где шла работа, и её проект (null - ещё не решён). */
export type PlaceRow = { id: number; path: string; project: string | null }

export type PlaceProject = { id: number; project: string | null }

/** Что умеет движок: запрос и ответ каждого действия. */
export type EngineOps = {
  scan: { request: { root: string }; response: ScanResult }
  query: {
    request: { period: StatsPeriod; filter: StatsFilter; now: number }
    response: StatsReport
  }
  note: { request: { note: LiveNote }; response: null }
  places: { request: { onlyUnresolved: boolean }; response: PlaceRow[] }
  setProjects: { request: { rows: PlaceProject[] }; response: null }
}

export type EngineOp = keyof EngineOps

export type EngineRequest<K extends EngineOp = EngineOp> = K extends EngineOp
  ? { op: K } & EngineOps[K]['request']
  : never

const FIRST_PASS_KEY = 'first_pass_at'
const LAST_SCAN_KEY = 'last_scan_at'
const PRICES_KEY = 'prices_version'

const metaNumber = (db: DatabaseSync, key: string): number | null => {
  const value = Number(readMeta(db, key))

  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * Вся работа с базой статистики. Живёт в своём потоке (scan-worker.ts), в тестах - прямо в
 * процессе: node:sqlite синхронный, и выборка за год или первый проход по гигабайтам
 * транскриптов в главном процессе останавливали бы окно.
 */
export class StatsEngine {
  private readonly db: DatabaseSync
  private readonly store: StatsStore
  private readonly scanner: TranscriptScanner
  private readonly notes: LiveNotes
  private scanning: Promise<ScanResult> | null = null
  private progress: StatsScanProgress

  constructor(
    dbPath: string,
    private readonly onProgress: (progress: StatsScanProgress) => void = () => undefined,
  ) {
    this.db = openStatsDb(dbPath)
    this.store = new StatsStore(this.db)
    this.scanner = new TranscriptScanner(this.store)
    this.notes = new LiveNotes(this.store)
    this.repriceIfNeeded()
    this.progress = {
      running: false,
      firstPassDone: metaNumber(this.db, FIRST_PASS_KEY) !== null,
      filesDone: 0,
      filesTotal: 0,
      bytesDone: 0,
      bytesTotal: 0,
      lastScanAt: metaNumber(this.db, LAST_SCAN_KEY),
    }
  }

  handle<K extends EngineOp>(request: EngineRequest<K>): Promise<EngineOps[K]['response']>
  async handle(request: EngineRequest): Promise<EngineOps[EngineOp]['response']> {
    if (request.op === 'scan') return this.scan(request.root)
    if (request.op === 'query') {
      return buildReport(this.db, request.period, request.filter, request.now)
    }

    if (request.op === 'note') {
      this.notes.write(request.note)

      return null
    }

    if (request.op === 'places') return this.places(request.onlyUnresolved)

    this.setProjects(request.rows)

    return null
  }

  close(): void {
    this.db.close()
  }

  /** Один проход за раз: второй вопрос ждёт идущий, а не читает те же байты рядом. */
  private scan(root: string): Promise<ScanResult> {
    this.scanning ??= this.runScan(root).finally(() => {
      this.scanning = null
    })

    return this.scanning
  }

  private async runScan(root: string): Promise<ScanResult> {
    this.progress = { ...this.progress, running: true }
    this.onProgress({ ...this.progress })

    try {
      const result = await this.scanner.scan(root, (step) => {
        this.progress = { ...this.progress, ...step }
        this.onProgress({ ...this.progress })
      })
      const now = Date.now()

      writeMeta(this.db, LAST_SCAN_KEY, String(now))
      if (!this.progress.firstPassDone) writeMeta(this.db, FIRST_PASS_KEY, String(now))

      this.progress = { ...this.progress, firstPassDone: true, lastScanAt: now }

      return result
    } finally {
      this.progress = { ...this.progress, running: false }
      this.onProgress({ ...this.progress })
    }
  }

  private places(onlyUnresolved: boolean): PlaceRow[] {
    const sql = onlyUnresolved
      ? 'SELECT id, path, project FROM places WHERE project IS NULL'
      : 'SELECT id, path, project FROM places'

    return this.db.prepare(sql).all() as PlaceRow[]
  }

  private setProjects(rows: readonly PlaceProject[]): void {
    const update = this.db.prepare('UPDATE places SET project = ? WHERE id = ?')

    inTransaction(this.db, () => {
      for (const row of rows) update.run(row.project, row.id)
    })
  }

  /** Цены поменялись (PRICES_VERSION) - пересчитать стоимость всех ответов в базе. */
  private repriceIfNeeded(): void {
    if (readMeta(this.db, PRICES_KEY) === PRICES_VERSION) return

    // Семь аргументов явно: SQLite узнаёт число аргументов функции по её length.
    this.db.function(
      'stats_cost',
      { deterministic: true },
      (model, input, output, cacheRead, cacheWrite, cacheWrite1h, fast) =>
        costOf(String(model), {
          input: Number(input),
          output: Number(output),
          cacheRead: Number(cacheRead),
          cacheWrite: Number(cacheWrite),
          cacheWrite1h: Number(cacheWrite1h),
          fast: Number(fast) === 1,
        }),
    )
    inTransaction(this.db, () => {
      this.db.exec(
        'UPDATE answers SET cost = stats_cost(model, input, output, cache_read, cache_write, cache_write_1h, fast)',
      )
      writeMeta(this.db, PRICES_KEY, PRICES_VERSION)
    })
  }
}
