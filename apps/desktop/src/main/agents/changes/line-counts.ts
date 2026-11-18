/**
 * Сколько строк добавила и убрала правка - одно правило на ленту, список файлов хода и
 * статистику. Пока у каждого был свой подсчёт, они расходились: лента писала новому файлу
 * «+0 -0», а список хода и статистика - его строки.
 */

/** Строки правки. */
export type LineChange = { added: number; removed: number }

/** Файл, записанный целиком: каждая строка новая; перевод строки в конце - не лишняя строка. */
export const writtenLines = (content: string): number => {
  const trimmed = content.replace(/\n+$/, '')

  return trimmed === '' ? 0 : trimmed.split('\n').length
}

/**
 * Строки кусков диффа (structuredPatch CLI, bashEditDiff, ханки хода): «+» - добавлена,
 * «-» - убрана, пробел - контекст. «\ No newline at end of file» не строка файла.
 */
export const patchLines = (hunks: unknown): LineChange => {
  const change = { added: 0, removed: 0 }

  if (!Array.isArray(hunks)) return change

  for (const hunk of hunks) {
    const lines = (hunk as { lines?: unknown } | null)?.lines

    if (!Array.isArray(lines)) continue

    for (const line of lines) {
      if (typeof line !== 'string') continue
      if (line.startsWith('+')) change.added += 1
      else if (line.startsWith('-')) change.removed += 1
    }
  }

  return change
}
