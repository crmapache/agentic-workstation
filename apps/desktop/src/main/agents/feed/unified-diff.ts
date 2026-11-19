import type { PatchHunk } from '@shared/conversation-feed'

/** Заголовок куска унифицированного диффа: `@@ -старт,строк +старт,строк @@`. */
const HUNK_HEAD = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

const lineCount = (value: string | undefined) => (value === undefined ? 1 : Number(value))

/**
 * Унифицированный дифф правки - кусками, как их рисует лента. Заголовков файла (`---`/`+++`,
 * `Index:`) может и не быть - куски ищутся по `@@`, всё до первого куска пропускается.
 */
export const hunksOfUnifiedDiff = (diff: string): PatchHunk[] => {
  const hunks: PatchHunk[] = []
  let current: PatchHunk | null = null

  for (const line of diff.split('\n')) {
    const head = HUNK_HEAD.exec(line)

    if (head) {
      current = {
        oldStart: Number(head[1]),
        oldLines: lineCount(head[2]),
        newStart: Number(head[3]),
        newLines: lineCount(head[4]),
        lines: [],
      }
      hunks.push(current)
    } else if (current && /^[ +\-\\]/.test(line)) {
      current.lines.push(line)
    }
  }

  return hunks
}

/** Сколько строк добавлено и удалено по кускам. */
export const hunkCounts = (hunks: readonly PatchHunk[]): { added: number; removed: number } => {
  const lines = hunks.flatMap((hunk) => hunk.lines)

  return {
    added: lines.filter((line) => line.startsWith('+')).length,
    removed: lines.filter((line) => line.startsWith('-')).length,
  }
}
