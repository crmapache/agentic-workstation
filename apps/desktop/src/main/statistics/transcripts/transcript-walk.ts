import type { Dirent } from 'node:fs'
import { stat, readdir } from 'node:fs/promises'
import { sep, join, basename, relative } from 'node:path'

/** Транскрипт на диске и чей он. */
export type TranscriptFile = {
  path: string
  size: number
  mtimeMs: number
  /** Когда файл создан: форк моложе своего оригинала, а оригинал должен прочитаться первым. */
  birthtimeMs: number
  /** Сессия: имя основного транскрипта или папка разговора над subagents/. */
  session: string
  subagent: boolean
}

/** Сколько stat делать разом: тысячи файлов, но не тысячи открытых вызовов сразу. */
const STAT_BATCH = 64

/**
 * Чей файл по его пути внутри projects/: `<проект>/<сессия>.jsonl` - основной транскрипт,
 * `<проект>/<сессия>/subagents/**\/agent-*.jsonl` - субагент разговора (на любой глубине:
 * у workflows своя папка внутри subagents/).
 */
export const transcriptOwner = (
  root: string,
  path: string,
): { session: string; subagent: boolean } => {
  const parts = relative(root, path).split(sep)
  const index = parts.indexOf('subagents')

  if (index > 0) return { session: parts[index - 1] ?? '', subagent: true }

  return { session: basename(path, '.jsonl'), subagent: false }
}

/** Все транскрипты под root (рекурсивно); папки, которых нет, - пустой ответ. */
export const walkTranscripts = async (root: string): Promise<TranscriptFile[]> => {
  const entries: Dirent[] = await readdir(root, { recursive: true, withFileTypes: true }).catch(
    () => [],
  )
  const paths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => join(entry.parentPath, entry.name))
  const files: TranscriptFile[] = []

  for (let index = 0; index < paths.length; index += STAT_BATCH) {
    const batch = await Promise.all(
      paths.slice(index, index + STAT_BATCH).map(async (path) => {
        const info = await stat(path).catch(() => null)

        if (!info) return null

        return {
          path,
          size: info.size,
          mtimeMs: info.mtimeMs,
          birthtimeMs: info.birthtimeMs || info.mtimeMs,
          ...transcriptOwner(root, path),
        }
      }),
    )

    for (const file of batch) if (file) files.push(file)
  }

  return files
}
