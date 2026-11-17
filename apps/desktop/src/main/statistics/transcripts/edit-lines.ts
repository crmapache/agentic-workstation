/**
 * Сколько строк добавила и убрала правка агента. Главный источник - structuredPatch в
 * результате инструмента (CLI сам посчитал разность с файлом), его считает общее правило
 * (claude/changes/line-counts.ts). Нет его (старые версии CLI) - разность старого и нового
 * куска с обрезкой общих начала и конца, как EditLines панели ACC.
 */

import type { LineChange } from '../../claude/changes/line-counts'

/** Строки правки по старому и новому тексту: совпадающие голова и хвост не считаются. */
export const editLines = (before: string, after: string): LineChange => {
  const old = before.split('\n')
  const next = after.split('\n')
  let head = 0

  while (head < old.length && head < next.length && old[head] === next[head]) head += 1

  let tail = 0

  while (
    tail < old.length - head &&
    tail < next.length - head &&
    old[old.length - 1 - tail] === next[next.length - 1 - tail]
  ) {
    tail += 1
  }

  return { added: next.length - head - tail, removed: old.length - head - tail }
}

/**
 * Команды оболочки, чьи изменения файлов - не написанный агентом код: git переключает и
 * сливает чужие строки, форматтер переставляет готовые, менеджер пакетов переписывает
 * lock-файлы на тысячи строк. CLI отдаёт разность файлов после любой команды
 * (bashEditDiff), и без этого списка «код агентами» вырос бы на каждом git pull.
 */
const NOT_AUTHORED = [
  /\bgit\s+(?:-C\s+\S+\s+)?(?:checkout|switch|pull|merge|rebase|reset|stash|restore|cherry-pick|revert|clone|fetch|worktree)\b/,
  /\b(?:prettier|eslint|stylelint|biome|black|ruff|isort|gofmt|goimports|rustfmt|swiftformat|ktlint|clang-format)\b/,
  /\b(?:npm|pnpm|yarn|bun)\s+(?:install|i|add|remove|rm|update|up|upgrade|dedupe|ci)\b/,
  /\b(?:pip3?|uv|poetry|cargo|go|bundle|composer|brew)\s+(?:install|add|get|update|sync|lock|mod)\b/,
]

/** Изменения файлов после этой команды не считаются кодом агента. */
export const isNotAuthoredCommand = (command: string): boolean =>
  NOT_AUTHORED.some((pattern) => pattern.test(command))

/** Расширение файла без точки, строчными; '' - без расширения (Makefile, .env). */
export const extensionOf = (path: string): string => {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')

  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}
