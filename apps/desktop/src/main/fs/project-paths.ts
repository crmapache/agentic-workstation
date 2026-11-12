import { sep, resolve, relative, isAbsolute } from 'node:path'

/**
 * Путь или имя в том виде, в каком их сравнивает окно, - NFC. Finder и Cocoa пишут
 * имена в NFD («й» = и + U+0306), readdir отдаёт их как есть, git с
 * core.precomposeunicode - в NFC, без него - как есть. Без приведения один и тот же
 * файл из поиска и из дерева был бы двумя разными строками, и дерево не раскрылось
 * бы до найденного. На диск ходим как угодно: APFS находит файл и по NFC-форме.
 */
export const toWindowPath = (path: string): string => path.normalize('NFC')

/**
 * Путь от корня проекта - для окна: NFC и через «/» (shared/fs.ts). На Windows relative() и
 * fs.watch отдают путь с обратными чертами, а окно режет пути по «/» (ADR 0048). Абсолютные
 * пути так не приводятся: они остаются путями системы.
 */
export const toWindowRelative = (path: string): string =>
  toWindowPath(sep === '/' ? path : path.split(sep).join('/'))

/**
 * Абсолютный путь к элементу проекта или null, если путь выходит за корень.
 *
 * Окно присылает путь от корня проекта, и главный процесс не верит ему на слово:
 * `../..` или абсолютный путь вывели бы чтение за пределы открытой папки.
 * Проверка лексическая - по строке пути, без обращения к диску.
 */
export const resolveInsideRoot = (rootPath: string, relativePath: string): string | null => {
  const absolute = resolve(rootPath, relativePath)
  const fromRoot = relative(rootPath, absolute)

  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    return null
  }

  return absolute
}
