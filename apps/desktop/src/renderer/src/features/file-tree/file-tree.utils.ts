import type { DirectoryEntry } from '@shared/fs'

import { isInsideAny, movedPathOf } from '../../lib/path.utils'

/** Папки, которые надо раскрыть, чтобы увидеть путь: «a/b/c.ts» - «a» и «a/b». */
export const ancestorPaths = (relativePath: string): string[] => {
  const parts = relativePath.split('/').slice(0, -1)

  return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}

/**
 * Папки-ссылки среди прочитанных списков. Дерево показывает внутри них цель ссылки, а
 * macOS сообщает об изменениях по настоящему пути цели - сами они о себе не узнают.
 */
export const symlinkedFolders = (listings: readonly (DirectoryEntry[] | undefined)[]): string[] =>
  listings.flatMap(
    (entries) =>
      entries
        ?.filter(({ kind, isSymlink }) => isSymlink && kind === 'directory')
        .map(({ relativePath }) => relativePath) ?? [],
  )

/**
 * Раскрытые папки после переноса: сама перенесённая и всё внутри неё - под новым путём, папка,
 * куда перенесли, раскрыта: видно, куда легло.
 */
export const movedExpanded = (expanded: readonly string[], from: string, to: string): string[] => {
  const moved = expanded.map((path) => movedPathOf(path, from, to))

  return [...new Set([...moved, ...ancestorPaths(to)])]
}

/** Раскрытые папки без убранной в корзину и всего внутри неё. */
export const withoutExpanded = (expanded: readonly string[], gone: string): string[] =>
  expanded.filter((path) => !isInsideAny(path, [gone]))
