import type { PatchHunk } from '@shared/conversation-feed'

/** Строки одной стороны куска: «+» - какой файл стал, «-» - каким был; контекст - в обеих. */
export const sideOf = (hunk: PatchHunk, mark: '+' | '-'): string[] =>
  hunk.lines
    .filter((line) => line.startsWith(' ') || line.startsWith(mark))
    .map((line) => line.slice(1))

/**
 * Где в файле стоит новый вид куска: по номеру строки, а если файл сдвинулся выше - единственное
 * совпадение в файле. Несколько совпадений или ни одного - -1: угадывать нельзя.
 */
const placeOf = (lines: readonly string[], side: readonly string[], expected: number): number => {
  const matches = (at: number) =>
    at >= 0 && at + side.length <= lines.length && side.every((line, i) => lines[at + i] === line)

  if (matches(expected)) return expected

  const found = lines.flatMap((_, at) => (matches(at) ? [at] : []))

  return found.length === 1 ? (found[0] ?? -1) : -1
}

/**
 * Правка в обратную сторону: каждый кусок, с последнего, - новые строки обратно в старые.
 * null - файл после правки меняли и кусок не нашёлся: вернуть его, не затерев чужое, нельзя.
 */
export const reverseHunks = (content: string, hunks: readonly PatchHunk[]): string | null => {
  const lines = content.split('\n')

  for (const hunk of hunks.toReversed()) {
    const after = sideOf(hunk, '+')
    const before = sideOf(hunk, '-')
    const expected = hunk.newLines === 0 ? hunk.newStart : hunk.newStart - 1
    const at = after.length === 0 ? expected : placeOf(lines, after, expected)

    if (at < 0 || at > lines.length) return null

    lines.splice(at, after.length, ...before)
  }

  return lines.join('\n')
}
