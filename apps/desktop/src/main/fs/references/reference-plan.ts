import type { FileMove } from '@shared/file-ops'

import type { Resolved, PathAlias, ProjectIndex } from './resolve'
import { resolveSpecifier, rewriteSpecifier } from './resolve'
import { flavorOf, findSpecifiers } from './specifiers'

/** Правка одного пути в тексте: где, что было и что встанет. */
export type ReferenceEdit = { start: number; end: number; was: string; now: string }

/** Правки файла: где он лежит сейчас и где окажется после переноса (если переносят его самого). */
export type FileEdits = { path: string; movedTo: string; edits: ReferenceEdit[] }

/** Где окажется путь после переноса: сам перенесённый, то, что внутри него, остальное - на месте. */
export const movedPath = (path: string, move: FileMove): string => {
  if (path === move.from) return move.to
  if (path.startsWith(`${move.from}/`)) return move.to + path.slice(move.from.length)

  return path
}

/** Индекс проекта из списка файлов: сами файлы и все папки над ними. */
export const projectIndex = (files: readonly string[]): ProjectIndex => {
  const dirs = new Set<string>()

  for (const file of files) {
    for (let cut = file.lastIndexOf('/'); cut > 0; cut = file.lastIndexOf('/', cut - 1)) {
      const dir = file.slice(0, cut)

      if (dirs.has(dir)) break
      dirs.add(dir)
    }
  }

  const byCase = (paths: Iterable<string>) =>
    new Map([...paths].map((path) => [path.toLowerCase(), path] as const))

  return { files: new Set(files), dirs, filesByCase: byCase(files), dirsByCase: byCase(dirs) }
}

/**
 * Перенос в путях списка файлов: дерево показывает имя с диска, а git после смены одного
 * регистра помнит прежнее - сверяемся без учёта регистра.
 */
export const indexedMove = (index: ProjectIndex, move: FileMove): FileMove => {
  const lower = move.from.toLowerCase()
  const from =
    index.files.has(move.from) || index.dirs.has(move.from)
      ? move.from
      : (index.filesByCase.get(lower) ?? index.dirsByCase.get(lower) ?? move.from)

  return { from, to: move.to }
}

/**
 * Правки одного файла: ссылки на переносимое (и на всё внутри папки) и - если переносят в
 * другую папку - собственные пути перенесённого файла на то, что осталось на месте. Пути
 * пишутся в той же форме, что были (без расширения, папкой, через синоним). null - править
 * нечего.
 */
export const planFile = (
  index: ProjectIndex,
  aliases: readonly PathAlias[],
  move: FileMove,
  path: string,
  body: string,
): FileEdits | null => {
  const flavor = flavorOf(path)

  if (!flavor) return null

  const movedTo = movedPath(path, move)
  const edits = findSpecifiers(body, flavor).flatMap((specifier) => {
    const found = resolveSpecifier(index, aliases, path, specifier.value, flavor)

    if (!found) return []

    const resolved = withMovedAlias(found, move)

    const target = movedPath(resolved.target, move)

    if (target === resolved.target && movedTo === path) return []

    const now = rewriteSpecifier(resolved, movedTo, target)

    return now === specifier.value
      ? []
      : [{ start: specifier.start, end: specifier.end, was: specifier.value, now }]
  })

  return edits.length > 0 ? { path, movedTo, edits } : null
}

/**
 * Синоним, чей конфиг переезжает вместе с папкой (переименовали apps/web со своим tsconfig),
 * переезжает и сам: импорт «@/x» внутри остаётся «@/x», а не превращается в «../../x».
 */
const withMovedAlias = (resolved: Resolved, move: FileMove): Resolved => {
  const { base } = resolved

  if (base.kind !== 'alias' || !isInside(base.alias.scope, move.from)) return resolved

  return {
    ...resolved,
    base: {
      kind: 'alias',
      pattern: movedPath(base.pattern, move),
      alias: {
        ...base.alias,
        scope: movedPath(base.alias.scope, move),
        targets: base.alias.targets.map((target) => movedPath(target, move)),
      },
    },
  }
}

const isInside = (path: string, root: string) => path === root || path.startsWith(`${root}/`)

/** Правки всех файлов проекта; текст файла - text(path), null - не прочитался. */
export const planReferences = (
  index: ProjectIndex,
  aliases: readonly PathAlias[],
  move: FileMove,
  text: (path: string) => string | null,
): FileEdits[] =>
  [...index.files].flatMap((path) => {
    const body = flavorOf(path) ? text(path) : null
    const planned =
      body === null ? null : planFile(index, aliases, indexedMove(index, move), path, body)

    return planned ? [planned] : []
  })

/**
 * Текст с правками. Каждая проверяется: на её месте должно стоять то, что было при расчёте, -
 * файл поменяли между расчётом и записью, и правка легла бы мимо: тогда null, файл не трогать.
 */
export const applyEdits = (text: string, edits: readonly ReferenceEdit[]): string | null => {
  let out = text

  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    if (out.slice(edit.start, edit.end) !== edit.was) return null

    out = out.slice(0, edit.start) + edit.now + out.slice(edit.end)
  }

  return out
}
