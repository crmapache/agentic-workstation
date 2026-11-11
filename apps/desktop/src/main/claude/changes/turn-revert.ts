import { stat, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { FileChange, ChangeRefusal } from '@shared/claude-feed'

import type { CliMessage } from '../cli/cli-messages'
import { parseCliLine } from '../cli/cli-messages'
import type { ConversationRuntime } from '../conversation/conversation-runtime'
import { readTranscriptLines } from '../history/transcript-files'
import { claudeHome, findTranscript } from '../history/transcript-paths'
import type { FileEdit } from './change-revert'
import { MAX_FILE_BYTES } from './changes.constants'
import { readCopy, copiesTaken, findTurnStart, copyRecordsFrom } from './file-copies'
import { revertOnDisk } from './file-revert'
import { turnTools, turnChanges } from './turn-changes'
import type { TurnFile, EditEntry } from './turn-edits'
import { filesOf, TurnEdits } from './turn-edits'
import type { SettledFile } from './turn-settle'
import { settleFile } from './turn-settle'

/** Файл на диске как текст с `\n`; null - нет, не файл или слишком большой. */
const readLeft = async (path: string) => {
  const info = await stat(path).catch(() => null)

  if (!info?.isFile() || info.size > MAX_FILE_BYTES) return null

  return readFile(path, 'utf8').then(
    (text) => text.replaceAll('\r\n', '\n'),
    () => null,
  )
}

/** Точные правки по файлам: без файлов, чей дифф знает только копия, и без неизменённых. */
const exactEdits = (files: ReadonlyMap<string, TurnFile>) =>
  new Map(
    [...files.values()]
      .filter((file) => !file.owing && !file.unchanged && file.edits.length > 0)
      .map((file) => [file.path, file.edits]),
  )

/** Строка файла после ответа: откачен или возвращён, отказ - причиной рядом, нечем - без кнопки. */
const answered =
  (results: ReadonlyMap<string, ChangeRefusal | null | 'unknown'>, restore: boolean) =>
  (change: FileChange): FileChange => {
    const result = results.get(change.path)

    if (result === undefined) return change
    if (result === 'unknown') return { ...change, undoable: false }
    if (result) return { ...change, refusal: result }

    return { ...change, reverted: !restore, refusal: null }
  }

/**
 * Откат файлов хода по его собственным диффам (ADR 0009 - своя реализация поведения
 * ACC). Живой поток CLI даёт точные правки каждого вызова (лента держит их обрезанными
 * для показа), конец хода уточняет по ним список и сверяет файлы с диском, откат
 * прикладывает ханки в обратную сторону к файлу, каким он стоит сейчас.
 */
export class TurnRevert {
  private readonly edits = new TurnEdits()
  /** Точные правки последнего хода по файлам - по ним откат и возврат. */
  private last: { turnId: string; files: Map<string, FileEdit[]> } | null = null
  /** Когда кончился прошлый ход: копии CLI для хода, начатого не человеком, - не раньше. */
  private lastEndedAt = 0
  /** Сверка и откаты по одному: нажатие не пишет файл наперегонки со сверкой или другим нажатием. */
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly runtime: ConversationRuntime) {}

  /** Строка живого потока CLI: правки и вызовы Write - в учёт хода. Ответ - правка строки. */
  observe(message: CliMessage): EditEntry | null {
    return this.edits.observe(message)
  }

  /**
   * Ход кончился (`result`), его итог уже в ленте. Синхронно, до отправки окну: список
   * уточняется по точным правкам (запись того же текста строки не даёт, кнопка - только
   * там, где дифф есть). Потом файлы сверяются с диском.
   */
  captureEnd(): Promise<void> {
    const { builder } = this.runtime.feed
    const latest = builder.latestTurn
    // Пустой ход (рукопожатие после --resume) итога не ставит: прошлый итог уже разобран,
    // и учёт, очищенный тогда, стёр бы его кнопки.
    const turn = latest && this.last?.turnId !== latest.id ? this.turn(latest.id) : null
    const tools = turn ? turnTools(builder.items, turn.id) : []
    const ledger = this.edits.entriesOf(tools.map((tool) => tool.id))
    const files = filesOf(ledger)
    const messageId = latest?.messageId ?? ''
    // Где ход начался в транскрипте: строка сообщения человека, а у хода, начатого самим
    // CLI (уведомлением фоновой задачи), - его первый вызов.
    const anchor = messageId || (tools.find((tool) => tool.parentToolUseId === null)?.id ?? '')
    const start = { since: this.since(messageId), anchor }

    this.lastEndedAt = Date.now()
    this.edits.forget()

    if (!turn) return Promise.resolve()

    builder.updateChanges(turn.id, () => turnChanges(tools, ledger))
    this.last = { turnId: turn.id, files: exactEdits(files) }

    return files.size > 0
      ? this.enqueue(() => this.settle(turn.id, files, start))
      : Promise.resolve()
  }

  /** Откатить (restore - вернуть) файл хода или все его файлы (path null). */
  apply(turnId: string, path: string | null, restore: boolean): Promise<void> {
    return this.enqueue(async () => {
      const turn = this.turn(turnId)

      if (!turn?.revertable) return

      const files = this.last?.turnId === turnId ? this.last.files : await this.replayed(turnId)
      const results = new Map<string, ChangeRefusal | null | 'unknown'>()
      const targets = turn.changes.filter(
        (change) =>
          change.undoable && (path === null ? change.reverted === restore : change.path === path),
      )

      for (const change of targets) {
        const edits = files.get(change.path)

        results.set(
          change.path,
          edits ? await revertOnDisk(change.path, edits, restore) : 'unknown',
        )
      }

      this.runtime.feed.builder.updateChanges(turnId, (changes) =>
        changes.map(answered(results, restore)),
      )
      this.runtime.feed.flush()
    })
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const run = this.queue.then(work)

    this.queue = run.catch((error: unknown) => {
      console.warn('[claude] файлы хода:', error)
    })

    return this.queue
  }

  private turn(id: string) {
    const item = this.runtime.feed.builder.items.find((entry) => entry.id === id)

    return item?.kind === 'turn' ? item : null
  }

  /**
   * С какого момента копии CLI - этого хода: с сообщения человека, начавшего ход (CLI
   * копирует файлы, получив его), иначе с конца прошлого хода. Копия от раньше - файл до
   * чужой работы, и дифф от неё унёс бы в откат и её.
   */
  private since(messageId: string) {
    const message = this.runtime.feed.builder.items.find((item) => item.id === messageId)
    const sent = message?.kind === 'user' ? message.time : 0

    return sent || this.lastEndedAt
  }

  private transcript() {
    const { projectPath, sessionId } = this.runtime.meta

    return findTranscript(projectPath, sessionId)
  }

  /** Сверка хода с диском: файлы, чьи диффы не ведут к тому, что на диске, - по правде. */
  private async settle(
    turnId: string,
    files: ReadonlyMap<string, TurnFile>,
    start: { since: number; anchor: string },
  ) {
    const transcript = await this.transcript()
    const from = transcript && start.anchor ? await findTurnStart(transcript, start.anchor) : null
    const copies =
      transcript && typeof from === 'number'
        ? copiesTaken(await copyRecordsFrom(transcript, from), start.since)
        : new Map<string, string>()
    const historyDir = join(await claudeHome(), 'file-history', this.runtime.meta.sessionId)
    const settled = new Map<string, SettledFile>()

    for (const file of files.values()) {
      if (file.unchanged) continue

      const created = file.edits[0]?.kind === 'create'
      const copy = created ? null : await readCopy(historyDir, copies, file.path)
      const result = settleFile(file, copy, await readLeft(file.path))

      if (result) settled.set(file.path, result)
    }

    if (settled.size === 0 || this.last?.turnId !== turnId) return

    for (const [path, result] of settled) this.last.files.set(path, result.edits)

    this.runtime.feed.builder.updateChanges(turnId, (changes) =>
      changes.map((change) => {
        const result = settled.get(change.path)

        return result
          ? {
              ...change,
              added: result.added,
              removed: result.removed,
              counted: true,
              undoable: true,
            }
          : change
      }),
    )
    this.runtime.feed.flush()
  }

  /**
   * Правки хода, которого панель не видела вживую (лента из транскрипта): из строк
   * транскрипта с его вызовами. Сверки у такого хода нет - только диффы CLI.
   */
  private async replayed(turnId: string) {
    const ids = turnTools(this.runtime.feed.builder.items, turnId).map((tool) => tool.id)
    const transcript = ids.length > 0 ? await this.transcript() : null
    const ledger = new TurnEdits()

    for (const line of transcript ? await readTranscriptLines(transcript) : []) {
      if (!ids.some((id) => line.includes(id))) continue

      const message = parseCliLine(line)

      if (message) ledger.observe(message)
    }

    return exactEdits(filesOf(ledger.entriesOf(ids)))
  }
}
