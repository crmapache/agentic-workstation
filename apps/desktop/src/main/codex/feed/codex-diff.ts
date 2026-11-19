import type { PatchHunk } from '@shared/conversation-feed'

import { hunkCounts, hunksOfUnifiedDiff } from '../../agents/feed/unified-diff'

/** Вид правки файла у Codex: новый, удалённый или изменённый (в том числе перенесённый). */
export type FileChangeKind = 'add' | 'delete' | 'update'

/**
 * Дифф правки Codex (`fileChange.changes[].diff`) - кусками, как их рисует лента. У изменения
 * это унифицированный дифф; заголовков файла (`---`/`+++`) может и не быть - куски ищутся по
 * `@@`. У нового и удалённого Codex кладёт сам текст файла (как читает и amazing-codex): один
 * кусок, где каждая строка добавлена или удалена.
 */
export const hunksFromDiff = (diff: string, kind: FileChangeKind): PatchHunk[] => {
  const hunks = hunksOfUnifiedDiff(diff)

  if (hunks.length > 0 || kind === 'update' || !diff) return hunks

  const lines = diff.replace(/\n$/, '').split('\n')

  return kind === 'add'
    ? [
        {
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: lines.length,
          lines: lines.map((line) => `+${line}`),
        },
      ]
    : [
        {
          oldStart: 1,
          oldLines: lines.length,
          newStart: 0,
          newLines: 0,
          lines: lines.map((line) => `-${line}`),
        },
      ]
}

export { hunkCounts }
