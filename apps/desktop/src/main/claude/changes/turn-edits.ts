import type { CliMessage } from '../cli/cli-messages'
import { isRecord, recordField, stringField, recordsField } from '../cli/cli-messages'
import type { EditHunk, FileEdit } from './change-revert'

/**
 * Что одна правка сделала с файлом по словам CLI: точный дифф (или создание), большая
 * правка без диффа (`structuredPatch: []`) или запись того же текста - ничего.
 */
export type EditEntry = { path: string; edit: FileEdit | 'undiffed' | 'unchanged' }

/** Файл хода глазами отката: точные правки по порядку и что про них известно. */
export type TurnFile = {
  path: string
  edits: FileEdit[]
  /** Хоть одна правка пришла без диффа: что ход сделал с файлом, знает только копия CLI. */
  owing: boolean
  /** Ни одна правка ничего не поменяла (Write того же текста). */
  unchanged: boolean
}

/** Ханки патча CLI, или null, если хоть один кривой: половина отката - файл, которого никто не писал. */
const hunksOf = (patch: readonly unknown[]): EditHunk[] | null => {
  const hunks: EditHunk[] = []

  for (const hunk of patch) {
    if (!isRecord(hunk)) return null

    const { newStart, oldStart, lines } = hunk

    if (typeof newStart !== 'number' || !Array.isArray(lines)) return null
    if (!lines.every((line) => typeof line === 'string')) return null

    hunks.push({
      newStart,
      oldStart: typeof oldStart === 'number' ? oldStart : newStart,
      lines,
    })
  }

  return hunks.length > 0 ? hunks : null
}

/**
 * Правка по структурной половине результата CLI. Созданный файл - по тексту вызова
 * (written), если он известен: результат может нести уже больше, чем написал вызов (CLI
 * дописывает файл памяти), а список считает и откатывает файл по вызову.
 */
export const entryOf = (structured: unknown, written: string | undefined): EditEntry | null => {
  if (!isRecord(structured)) return null

  const path = stringField(structured, 'filePath')
  const patch = structured['structuredPatch']

  if (!path) return null
  if (structured['type'] === 'create') {
    return {
      path,
      edit: { kind: 'create', content: written ?? stringField(structured, 'content') },
    }
  }
  if (!Array.isArray(patch)) return null

  if (patch.length === 0) {
    // «Ничего не изменилось» - только запись того же текста: рядом с большой правкой
    // CLI шлёт обрезанный originalFile, и пустой дифф там значит «не посчитал».
    const content = written ?? stringField(structured, 'content')
    const unchanged = content !== '' && content === stringField(structured, 'originalFile')

    return { path, edit: unchanged ? 'unchanged' : 'undiffed' }
  }

  const hunks = hunksOf(patch)

  return { path, edit: hunks ? { kind: 'patch', hunks } : 'undiffed' }
}

/**
 * Правки хода по вызовам - из живого потока CLI (и субагентов тоже) или из строк
 * транскрипта. Лента держит дифф обрезанным для показа, а откату и сверке нужен
 * целиком - он живёт здесь, в главном процессе, и в окно не уходит.
 */
export class TurnEdits {
  private readonly entries = new Map<string, EditEntry>()
  /** Текст каждого Write до его результата: созданный файл считается по вызову. */
  private readonly writes = new Map<string, string>()

  /**
   * Строка CLI: вызовы Write запоминаются, результаты правок ложатся по id вызова. Ответ -
   * правка, которую принесла эта строка (её видит и локальная история), или null.
   */
  observe(message: CliMessage): EditEntry | null {
    const content = recordsField(recordField(message, 'message'), 'content')

    if (message.type === 'assistant') {
      for (const block of content) {
        if (block['type'] !== 'tool_use' || block['name'] !== 'Write') continue

        const written = recordField(block, 'input')['content']

        if (typeof written === 'string') this.writes.set(stringField(block, 'id'), written)
      }
    }

    if (message.type !== 'user') return null

    const results = content.filter((block) => block['type'] === 'tool_result')
    const [result] = results

    // Структурная половина - у сообщения, а не у блока: верим ей, только когда результат один.
    if (!result || results.length !== 1 || result['is_error'] === true) return null

    const id = stringField(result, 'tool_use_id')
    const entry = entryOf(
      message['tool_use_result'] ?? message['toolUseResult'],
      this.writes.get(id),
    )

    this.writes.delete(id)
    if (entry) this.entries.set(id, entry)

    return entry
  }

  /** Что известно о правках этих вызовов - по id вызова. */
  entriesOf(toolIds: Iterable<string>): Map<string, EditEntry> {
    const found = new Map<string, EditEntry>()

    for (const id of toolIds) {
      const entry = this.entries.get(id)

      if (entry) found.set(id, entry)
    }

    return found
  }

  /** Ход кончился: его правки разобраны, следующий начинает с чистого. */
  forget(): void {
    this.entries.clear()
    this.writes.clear()
  }
}

/**
 * Правки по файлам, в том порядке, в каком CLI их применял. Порядок - по entries: Map
 * хранит его, а правки ложатся по мере результатов.
 */
export const filesOf = (entries: ReadonlyMap<string, EditEntry>): Map<string, TurnFile> => {
  const files = new Map<string, TurnFile>()

  for (const { path, edit } of entries.values()) {
    const file = files.get(path) ?? { path, edits: [], owing: false, unchanged: true }

    if (edit === 'undiffed') file.owing = true
    if (edit !== 'unchanged') file.unchanged = false
    if (typeof edit === 'object') file.edits.push(edit)

    files.set(path, file)
  }

  return files
}
