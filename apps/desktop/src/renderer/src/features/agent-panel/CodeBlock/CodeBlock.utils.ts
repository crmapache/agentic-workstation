import type { ThemedToken } from 'shiki/core'

import { splitLinks } from '../paths.utils'
import type { KnownFiles } from '../paths.utils'
import { tokenClassName } from '../../../lib/syntax-classes.utils'
import type { CodeRun, CodePath, CodeSegment } from './CodeBlock.types'

/**
 * Пути в коде со смещениями. Адреса сайтов ссылками не становятся - в блоке кода это
 * текст команды или конфига. splitLinks возвращает исходник символ в символ; не сошлась
 * длина - лучше блок без ссылок, чем ссылки не на своих местах.
 */
export const findCodePaths = (code: string, known: KnownFiles): CodePath[] => {
  const paths: CodePath[] = []
  let offset = 0

  for (const chunk of splitLinks(code, known)) {
    if (chunk.kind === 'path') {
      paths.push({
        start: offset,
        end: offset + chunk.text.length,
        request: chunk.request,
        folder: chunk.folder,
      })
    }

    offset += chunk.text.length
  }

  return offset === code.length ? paths : []
}

/** Кусок с путём, под которым он стоит, - до склейки в группы. */
type Piece = CodeSegment & { path: CodePath | null }

/** Соседние куски под одним путём - в одну ссылку, вне путей - в одну группу. */
const groupRuns = (pieces: readonly Piece[]): CodeRun[] =>
  pieces.reduce<CodeRun[]>((runs, { path, ...segment }) => {
    const last = runs.at(-1)

    if (last && last.path === path) last.segments.push(segment)
    else runs.push({ path, segments: [segment] })

    return runs
  }, [])

/**
 * Разрезать кусок `[start, end)` кода по границам путей. `cursor` - номер первого пути,
 * который ещё не кончился: куски идут по порядку, и пути перебираются один раз на весь код.
 */
const cutByPaths = (
  text: string,
  start: number,
  className: string,
  paths: readonly CodePath[],
  cursor: { index: number },
): Piece[] => {
  const pieces: Piece[] = []
  const end = start + text.length
  let position = start

  while (position < end) {
    while ((paths[cursor.index]?.end ?? Infinity) <= position) cursor.index += 1

    const path = paths[cursor.index]
    const inside = path !== undefined && path.start <= position
    const stop = Math.min(end, inside ? path.end : (path?.start ?? end))

    pieces.push({
      text: text.slice(position - start, stop - start),
      className,
      path: inside ? path : null,
    })
    position = stop
  }

  return pieces
}

/**
 * Строки подсветки, разрезанные по путям: путь, разбитый подсветкой на несколько
 * токенов, остаётся одной ссылкой, а каждый его кусок - своего цвета.
 */
export const highlightedRuns = (
  lines: readonly ThemedToken[][],
  paths: readonly CodePath[],
  styles: Readonly<Record<string, string>>,
): CodeRun[][] => {
  const cursor = { index: 0 }

  return lines.map((line) =>
    groupRuns(
      line.flatMap((token) =>
        cutByPaths(token.content, token.offset, tokenClassName(token, styles), paths, cursor),
      ),
    ),
  )
}

/** Код без подсветки (язык неизвестен или подсветка ещё не готова), но с путями. */
export const plainRuns = (code: string, paths: readonly CodePath[]): CodeRun[] =>
  groupRuns(cutByPaths(code, 0, '', paths, { index: 0 }))
