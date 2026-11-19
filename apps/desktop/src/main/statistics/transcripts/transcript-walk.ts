import type { Dirent } from 'node:fs'
import { stat, readdir } from 'node:fs/promises'
import { sep, join, basename, relative } from 'node:path'

import type { JournalFile } from '../journals/journal-format'

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

/** Файлы *.jsonl под root (рекурсивно) с размером и временем; папки, которых нет, - пусто. */
export const walkJsonl = async (
  root: string,
  ownerOf: (path: string) => Pick<JournalFile, 'session' | 'subagent'>,
  accept: (name: string) => boolean = () => true,
): Promise<JournalFile[]> => {
  const entries: Dirent[] = await readdir(root, { recursive: true, withFileTypes: true }).catch(
    () => [],
  )
  const paths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl') && accept(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
  const files: JournalFile[] = []

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
          ...ownerOf(path),
        }
      }),
    )

    for (const file of batch) if (file) files.push(file)
  }

  return files
}

/** Все транскрипты Claude Code под projects/ (рекурсивно). */
export const walkTranscripts = (root: string): Promise<JournalFile[]> =>
  walkJsonl(root, (path) => transcriptOwner(root, path))
