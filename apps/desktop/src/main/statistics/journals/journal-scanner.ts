import { openSync, closeSync } from 'node:fs'
import type { StatementSync } from 'node:sqlite'

import type { ProviderId } from '@shared/providers'

import type { StatsStore } from '../stats-store'
import { TimedBatch } from '../timed-batch'
import { codexJournal } from '../codex/codex-journal'
import { OpenCodeSource } from '../opencode/opencode-source'
import { claudeJournal } from '../transcripts/claude-journal'
import { RowWriter } from '../transcripts/row-writer'
import { TurnWriter } from '../transcripts/turn-writer'
import type { ScanSource, JournalFile, JournalFormat } from './journal-format'
import { NEWLINE, readChunk } from './read-chunk'

/** Сколько прочитано в этом проходе: окно показывает «считаю» с долей. */
export type ScanProgress = {
  filesDone: number
  filesTotal: number
  bytesDone: number
  bytesTotal: number
}

export type ScanResult = ScanProgress & { changed: boolean; ms: number }

type KnownFile = { id: number; offset: number; carry: string | null }

/** Файл журнала в работе прохода: чей он и чем его разбирать. */
type Work = JournalFile & { provider: ProviderId; format: JournalFormat }

/** JSONL-журналы провайдеров; OpenCode держит разговоры в базе - он читается отдельно. */
const JOURNALS: Partial<Record<ProviderId, JournalFormat>> = {
  claude: claudeJournal,
  codex: codexJournal,
}

/**
 * Обход журналов всех провайдеров. JSONL-файл дочитывается с того байта, где остановился
 * прошлый проход; укоротившийся (переписанный) - стирается и читается заново. Строки куска и
 * новое смещение файла пишутся в одной транзакции - оборванный проход продолжится с того же
 * места. Первым читается старший файл: оригинал разговора раньше своего форка, чтобы
 * скопированная история осталась за оригиналом. База OpenCode дочитывается после файлов -
 * по времени правки сообщений (opencode-source.ts).
 */
export class JournalScanner {
  private readonly writer: RowWriter
  private readonly turns: TurnWriter
  private readonly openCode: OpenCodeSource
  private readonly insertFile: StatementSync
  private readonly updateFile: StatementSync

  constructor(private readonly store: StatsStore) {
    this.writer = new RowWriter(store)
    this.turns = new TurnWriter(store.db)
    this.openCode = new OpenCodeSource(store, this.writer)
    this.insertFile = store.db.prepare(
      'INSERT INTO files (path, size, mtime_ms, offset) VALUES (?, ?, ?, 0) RETURNING id',
    )
    this.updateFile = store.db.prepare(
      'UPDATE files SET size = ?, mtime_ms = ?, offset = ?, carry = ? WHERE id = ?',
    )
  }

  async scan(
    sources: readonly ScanSource[],
    onProgress: (progress: ScanProgress) => void,
  ): Promise<ScanResult> {
    const started = Date.now()
    const known = this.knownFiles()
    const work = (await this.journalFiles(sources))
      .filter((file) => file.size !== known.get(file.path)?.offset)
      .sort((a, b) => a.birthtimeMs - b.birthtimeMs)
    const databases = sources.filter((source) => source.provider === 'opencode')
    const progress: ScanProgress = {
      filesDone: 0,
      filesTotal: work.length + databases.length,
      bytesDone: 0,
      bytesTotal: work.reduce((sum, file) => {
        const offset = known.get(file.path)?.offset ?? 0

        return sum + (file.size < offset ? file.size : file.size - offset)
      }, 0),
    }
    const touched = new Set<number>()
    const batch = new TimedBatch(this.store.db)
    let fresh = false

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
          console.warn('[statistics] journal read failed', file.path, error)
          this.store.resetCache()
        }

        progress.filesDone += 1
        onProgress({ ...progress })
      }

      for (const database of databases) {
        // База OpenCode не читается сама (занята, другая схема) - проход идёт дальше без неё.
        fresh = (await this.openCode.read(database.path, batch, touched)) || fresh
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
    const changed = progress.bytesDone > 0 || touched.size > 0 || fresh

    return { ...progress, changed, ms: Date.now() - started }
  }

  /**
   * Файлы JSONL-журналов всех источников, каждый - со своим провайдером и разбором. Папки
   * источников могут вложиться друг в друга (CODEX_HOME внутри чужой папки) - файл читает
   * первый источник, иначе второй пытался бы завести тот же файл ещё раз.
   */
  private async journalFiles(sources: readonly ScanSource[]): Promise<Work[]> {
    const lists = await Promise.all(
      sources.map(async (source) => {
        const format = JOURNALS[source.provider]

        if (!format) return []

        const files = await format.walk(source.path)

        return files.map((file): Work => ({ ...file, provider: source.provider, format }))
      }),
    )

    return [
      ...new Map(
        lists
          .flat()
          .reverse()
          .map((file) => [file.path, file]),
      ).values(),
    ]
  }

  private knownFiles(): Map<string, KnownFile> {
    const select = this.store.db.prepare('SELECT id, path, offset, carry FROM files')
    const rows = select.all() as (KnownFile & { path: string })[]

    return new Map(rows.map((row) => [row.path, row]))
  }

  private async readFile(
    file: Work,
    known: KnownFile | undefined,
    batch: TimedBatch,
    touched: Set<number>,
    onBytes: (bytes: number) => void,
  ) {
    const id = batch.step(() =>
      known ? known.id : (this.insertFile.get(file.path, file.size, file.mtimeMs) as KnownFile).id,
    )
    let offset = known?.offset ?? 0
    let carry = known?.carry ?? null

    if (file.size < offset) {
      batch.step(() => {
        for (const session of this.writer.dropFile(id)) touched.add(session)
        this.updateFile.run(file.size, file.mtimeMs, 0, null, id)
      })
      offset = 0
      carry = null
    }

    const parser = file.format.parser(file, carry, {
      knownTool: (toolId) => this.writer.knownTool(toolId),
      isCopy: (table, key) => this.writer.isCopy(id, table, key),
    })
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

          for (const session of this.writer.write(id, parser.take(), file.provider)) {
            touched.add(session)
          }

          this.updateFile.run(file.size, file.mtimeMs, offset + consumed, parser.carry, id)
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
