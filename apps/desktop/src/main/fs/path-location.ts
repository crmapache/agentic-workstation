import { sep, win32, resolve, relative, normalize, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

import { IS_WINDOWS } from '../platform'
import { toWindowPath } from './project-paths'

/** Как написан путь: куда он ведёт на диске и можно ли искать его по имени, если там пусто. */
export type WrittenPath = { absolutePath: string; written: string; byName: boolean }

/** Длиннее путей не бывает: такая «ссылка» - кусок текста, а не путь. */
const MAX_PATH_LENGTH = 4096

/** Управляющих знаков в именах файлов нет, а через них путь прячут от глаза. */
export const hasControlChars = (path: string): boolean =>
  [...path].some((char) => {
    const code = char.charCodeAt(0)

    return code < 0x20 || code === 0x7f
  })

/**
 * Сетевой путь: `//host/share`, `\\host\share`, `smb://`, `afp://`. Текст, из которого
 * читается путь, пишет агент - пересказ файлов, вывода команд, страниц из сети. Поход
 * по такому пути - обращение к хосту, которого никто не выбирал, а отвалившаяся шара
 * подвешивает чтение на секунды.
 */
export const isNetworkPath = (path: string): boolean =>
  path.startsWith('//') ||
  path.startsWith('\\\\') ||
  path.includes('://') ||
  // На Windows сетевой путь пишут и смесью черт («\\/host/share»): решает вид после
  // нормализации - иначе stat пошёл бы по SMB к чужому хосту с хешем пароля человека.
  (IS_WINDOWS && win32.normalize(path).startsWith('\\\\'))

/** Корень пути Windows - диск («C:\\»): путь от корня текущего диска («\\x») не принимаем. */
const DRIVE_ROOT = /^[A-Za-z]:\\/

/**
 * Абсолютный путь вне проекта, который прислало окно, - нормализованный, или null, если
 * идти по нему нельзя: не абсолютный, слишком длинный, сетевой, с управляющими знаками.
 * Окну на слово не верим: путь пришёл из текста, который писал агент.
 */
export const outsidePath = (path: string): string | null =>
  isAbsolute(path) &&
  path.length <= MAX_PATH_LENGTH &&
  !isNetworkPath(path) &&
  !hasControlChars(path) &&
  (!IS_WINDOWS || DRIVE_ROOT.test(normalize(path)))
    ? normalize(path)
    : null

/** `file://` агент тоже пишет - снимаем. Хост в адресе (не localhost) - сетевой путь, отказ. */
const withoutFileScheme = (path: string): string | null => {
  if (!/^file:/i.test(path)) return path

  try {
    return fileURLToPath(path)
  } catch {
    return null
  }
}

/**
 * `~` и `~/…` (на Windows и `~\…`) - домашняя папка этого человека. `~user` не трогаем:
 * чужой дом - не этот, а угадывать его место незачем.
 */
export const expandHome = (path: string, homePath: string): string => {
  if (path === '~') return homePath
  if (path.startsWith('~/') || (IS_WINDOWS && path.startsWith('~\\'))) {
    return resolve(homePath, path.slice(2))
  }

  return path
}

/**
 * Написанный путь - в абсолютный на диске, или null, если идти по нему нельзя (пусто,
 * сетевой, управляющие знаки). Относительный - от корня проекта.
 *
 * Искать по имени можно только относительный путь: начатый с `~` или с корня диска
 * называет место вне проекта, и одноимённый файл проекта был бы не худшим ответом, а
 * чужим файлом, открытым уверенно.
 */
export const readWrittenPath = (
  path: string,
  rootPath: string,
  homePath: string,
): WrittenPath | null => {
  const trimmed = path.trim()

  if (!trimmed || trimmed.length > MAX_PATH_LENGTH) return null

  const written = withoutFileScheme(trimmed)

  if (written === null || isNetworkPath(written) || hasControlChars(written)) return null

  const expanded = expandHome(written, homePath)
  const absolute = isAbsolute(expanded)

  return {
    absolutePath: absolute ? normalize(expanded) : resolve(rootPath, expanded),
    written,
    byName: !absolute && !written.startsWith('~'),
  }
}

/** Путь от корня через «/» в NFC (как в дереве), или null, если путь вне корня. */
export const insideRoot = (rootPath: string, absolutePath: string): string | null => {
  const fromRoot = relative(rootPath, absolutePath)

  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) return null

  return toWindowPath(fromRoot.split(sep).join('/'))
}

/** Куски пути между разделителями, любыми; без пустых и без «.» - «здесь». */
const segmentsOf = (path: string): string[] =>
  path.split(/[/\\]/).filter((segment) => segment !== '' && segment !== '.')

const sameSegment = (a: string, b: string, caseSensitive: boolean) =>
  caseSensitive ? a === b : a.toLowerCase() === b.toLowerCase()

/** Кончается ли путь этими кусками целиком: `src/a.ts` - хвост `x/src/a.ts`, но не `xsrc/a.ts`. */
const endsWithSegments = (path: string[], tail: string[], caseSensitive: boolean): boolean => {
  if (tail.length > path.length) return false

  const offset = path.length - tail.length

  return tail.every((segment, index) =>
    sameSegment(path[offset + index] ?? '', segment, caseSensitive),
  )
}

/**
 * Файлы проекта, которые подходят под написанное, - как «Go to File»: по имени, сужая
 * написанными перед ним папками (`components/Button.js` - это `src/components/Button.js`).
 * Под этими папками ничего - все файлы с таким именем: список на выбор - ответ, а «ничего
 * не произошло» - то, чем клик по ссылке быть не должен. `..` - отказ: хвост наверх не
 * лезет. Ближние к корню первыми, среди равных - по алфавиту, чтобы список не прыгал.
 */
export const rankByName = (
  written: string,
  candidates: readonly string[],
  caseSensitive: boolean,
): string[] => {
  const wanted = segmentsOf(toWindowPath(written))

  if (wanted.length === 0 || wanted.includes('..')) return []

  const split = candidates.map((path) => ({ path, segments: segmentsOf(path) }))
  const matching = (tail: string[]) =>
    split.filter(({ segments }) => endsWithSegments(segments, tail, caseSensitive))
  const underFolders = matching(wanted)
  const found = underFolders.length > 0 ? underFolders : matching(wanted.slice(-1))

  return found
    .sort((a, b) => a.segments.length - b.segments.length || a.path.localeCompare(b.path))
    .map(({ path }) => path)
}
