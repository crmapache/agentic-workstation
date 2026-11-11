import { openSync, readSync, closeSync } from 'node:fs'
import type { StatementSync } from 'node:sqlite'

import type { StatsStore } from '../stats-store'
import { FLUSH_BYTES } from '../stats.constants'
import { TimedBatch } from '../timed-batch'
import { FileParser } from './file-parser'
import type { SpanRow } from './parsed-rows'
import { RowWriter } from './row-writer'
import type { TranscriptFile } from './transcript-walk'
import { walkTranscripts } from './transcript-walk'
import { TurnWriter } from './turn-writer'

const NEWLINE = 0x0a

/** Сколько прочитано в этом проходе: окно показывает «считаю» с долей. */
export type ScanProgress = {
  filesDone: number
  filesTotal: number
  bytesDone: number
  bytesTotal: number
}

export type ScanResult = ScanProgress & { changed: boolean; ms: number }

type KnownFile = { id: number; offset: number; carry: string | null }

const parseCarry = (text: string | null): SpanRow | null => {
  if (!text) return null

  try {
    return JSON.parse(text) as SpanRow
  } catch {
    return null
  }
}

/**
 * Прочитать с offset кусок до FLUSH_BYTES, кончающийся целой строкой. Строка длиннее куска
 * (бывают по 11 МБ) дочитывается целиком. consumed 0 - в хвосте лишь недописанная строка:
 * CLI допишет её, и следующий проход прочтёт. Чтение синхронное: сканер живёт в своём
 * потоке, а транзакция куска не должна прерываться await.
 */
const readChunk = (fd: number, offset: number, size: number) => {
  let length = Math.min(FLUSH_BYTES, size - offset)

  for (;;) {
    const buffer = Buffer.allocUnsafe(length)
    const bytesRead = readSync(fd, buffer, 0, length, offset)
    const data = buffer.subarray(0, bytesRead)
    const end = data.lastIndexOf(NEWLINE)

    if (end !== -1) return { data, consumed: end + 1 }
    if (bytesRead < length || offset + length >= size) return { data, consumed: 0 }

    length = Math.min(length * 2, size - offset)
  }
}

/**
 * Обход транскриптов: каждый файл дочитывается с того байта, где остановился прошлый
 * проход; укоротившийся (переписанный) - стирается и читается заново. Строки куска и новое
 * смещение файла пишутся в одной транзакции - оборванный проход продолжится с того же места.
 * Первым читается старший файл: оригинал разговора раньше своего форка, чтобы
 * скопированная история осталась за оригиналом.
 */
export class TranscriptScanner {
  private readonly writer: RowWriter
  private readonly turns: TurnWriter
  private readonly insertFile: StatementSync
  private readonly updateFile: StatementSync

  constructor(private readonly store: StatsStore) {
    this.writer = new RowWriter(store)
    this.turns = new TurnWriter(store.db)
    this.insertFile = store.db.prepare(
      'INSERT INTO files (path, size, mtime_ms, offset) VALUES (?, ?, ?, 0) RETURNING id',
    )
    this.updateFile = store.db.prepare(
      'UPDATE files SET size = ?, mtime_ms = ?, offset = ?, carry = ? WHERE id = ?',
    )
  }

  async scan(root: string, onProgress: (progress: ScanProgress) => void): Promise<ScanResult> {
    const started = Date.now()
    const known = this.knownFiles()
    const work = (await walkTranscripts(root))
      .filter((file) => file.size !== known.get(file.path)?.offset)
      .sort((a, b) => a.birthtimeMs - b.birthtimeMs)
    const progress: ScanProgress = {
      filesDone: 0,
      filesTotal: work.length,
      bytesDone: 0,
      bytesTotal: work.reduce((sum, file) => {
        const offset = known.get(file.path)?.offset ?? 0

        return sum + (file.size < offset ? file.size : file.size - offset)
      }, 0),
    }
    const touched = new Set<number>()
    const batch = new TimedBatch(this.store.db)

    onProgress({ ...progress })

    try {
      for (const file of work) {
        try {
          await this.readFile(file, known.get(file.path), batch, touched, (bytes) => {
            progress.bytesDone += bytes
            onProgress({ ...progress })
          })
        } catch (error) {
          // Один битый файл не останавливает проход: дочитается в следующий раз.
          console.warn('[statistics] transcript read failed', file.path, error)
          this.store.resetCache()
        }

        progress.filesDone += 1
        onProgress({ ...progress })
      }

      for (const session of touched) {
        batch.step(() => this.turns.recompute(session))
        await batch.breathe()
      }

      batch.commit()
    } catch (error) {
      // Откат вернул и новые папки и сессии: их id в кэше больше не существуют.
      this.store.resetCache()
      batch.rollback()
      throw error
    }

    // Файл с недописанной строкой в хвосте попадает в работу каждый проход, но ничего не
    // меняет: «изменилось» - только если что-то прочитано или стёрто.
    const changed = progress.bytesDone > 0 || touched.size > 0

    return { ...progress, changed, ms: Date.now() - started }
  }

  private knownFiles(): Map<string, KnownFile> {
    const select = this.store.db.prepare('SELECT id, path, offset, carry FROM files')
    const rows = select.all() as (KnownFile & { path: string })[]

    return new Map(rows.map((row) => [row.path, row]))
  }

  private async readFile(
    file: TranscriptFile,
    known: KnownFile | undefined,
    batch: TimedBatch,
    touched: Set<number>,
    onBytes: (bytes: number) => void,
  ) {
    const id = batch.step(() =>
      known ? known.id : (this.insertFile.get(file.path, file.size, file.mtimeMs) as KnownFile).id,
    )
    let offset = known?.offset ?? 0
    let carry = parseCarry(known?.carry ?? null)

    if (file.size < offset) {
      batch.step(() => {
        for (const session of this.writer.dropFile(id)) touched.add(session)
        this.updateFile.run(file.size, file.mtimeMs, 0, null, id)
      })
      offset = 0
      carry = null
    }

    const parser = new FileParser(
      {
        session: file.session,
        subagent: file.subagent,
        knownTool: (toolId) => this.writer.knownTool(toolId),
        isCopy: (table, key) => this.writer.isCopy(id, table, key),
      },
      carry,
    )
    const fd = openSync(file.path, 'r')

    try {
      while (offset < file.size) {
        const { data, consumed } = readChunk(fd, offset, file.size)

        if (consumed === 0) break

        batch.step(() => {
          for (let start = 0; start < consumed;) {
            const end = data.indexOf(NEWLINE, start)

            if (end > start) parser.line(data.subarray(start, end))

            start = end + 1
          }

          for (const session of this.writer.write(id, parser.take())) touched.add(session)

          const span = parser.carry
          const next = offset + consumed

          this.updateFile.run(file.size, file.mtimeMs, next, span && JSON.stringify(span), id)
        })

        offset += consumed
        onBytes(consumed)
        await batch.breathe()
      }
    } finally {
      closeSync(fd)
    }
  }
}
