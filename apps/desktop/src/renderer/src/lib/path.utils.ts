import { IS_MAC } from './platform'

/**
 * Пути в окне (ADR 0048). Путь от корня проекта - всегда через «/» (shared/fs.ts). Абсолютный
 * путь - путь системы: на маке «/Users/…», на Windows «C:\Users\…» или сетевой «\\server\…».
 * У путей Windows части разделяет и «\», и «/»; на маке «\» - буква имени файла, а не черта.
 */
const WINDOWS_ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\\\\)/

const isWindowsPath = (path: string) => !IS_MAC || WINDOWS_ABSOLUTE.test(path)

/** Последняя черта пути: на маке только «/», у путей Windows - и «\». */
const lastSeparator = (path: string) =>
  isWindowsPath(path)
    ? Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    : path.lastIndexOf('/')

/**
 * Путь от корня проекта: имя файла отдельно, папка над ним отдельно, без слеша на
 * конце. Файл в корне - папка пустая. Нужно поиску, панели Claude Code и редактору.
 */
export const splitPath = (path: string): { folder: string; name: string } => {
  const slash = lastSeparator(path)

  return { folder: slash < 0 ? '' : path.slice(0, slash), name: path.slice(slash + 1) }
}

/** Части пути по его чертам: у путей Windows - по обеим (подписи вкладок по папкам). */
export const pathParts = (path: string): string[] => path.split(isWindowsPath(path) ? /[\\/]/ : '/')

/**
 * Последняя часть пути - имя папки или файла, как его зовут люди: проект по корню, файл в
 * чипе. Слеш на конце не мешает; путь без частей («/») - как есть.
 */
export const baseName = (path: string): string => pathParts(path).filter(Boolean).at(-1) ?? path

/**
 * Путь вне проекта: ключ его вкладки - абсолютный путь, а путь от корня проекта никогда не
 * начинается с «/» или диска (дерево, поиск, git). Файл вне проекта открывают ссылкой из ленты.
 */
export const isOutsidePath = (path: string): boolean =>
  path.startsWith('/') || WINDOWS_ABSOLUTE.test(path)

/** Черта абсолютного пути: «\» у путей Windows, иначе «/». */
const separatorOf = (path: string) => (WINDOWS_ABSOLUTE.test(path) ? '\\' : '/')

/** Путь для показа: домашняя папка - через ~, как в WebStorm и терминале. */
export const displayPath = (path: string, homeDir: string | undefined): string =>
  homeDir && (path === homeDir || path.startsWith(`${homeDir}${separatorOf(homeDir)}`))
    ? `~${path.slice(homeDir.length)}`
    : path

/**
 * Абсолютный путь элемента проекта - корень и путь от него, чертой системы корня: на Windows
 * «C:\repo» и «src/a.ts» дают «C:\repo\src\a.ts» (копировать путь, открыть в системе).
 */
export const joinRoot = (rootPath: string, relativePath: string): string => {
  const separator = separatorOf(rootPath)
  const root = rootPath.endsWith(separator) ? rootPath.slice(0, -1) : rootPath

  return relativePath ? `${root}${separator}${relativePath.split('/').join(separator)}` : root
}

/**
 * Путь от корня проекта, если абсолютный путь внутри него; иначе как есть. У путей Windows
 * черты любые и диск без учёта регистра (CLI пишет и «c:\», и «C:/»), путь от корня - через «/».
 */
export const relativeTo = (path: string, rootPath: string | undefined): string => {
  if (!rootPath) return path
  if (!WINDOWS_ABSOLUTE.test(rootPath)) {
    const root = rootPath.endsWith('/') ? rootPath : `${rootPath}/`

    return path.startsWith(root) ? path.slice(root.length) : path
  }

  const normal = (value: string) => value.replaceAll('/', '\\').toLowerCase()
  const root = normal(rootPath).replace(/\\$/, '')
  const candidate = normal(path)

  return candidate.startsWith(`${root}\\`)
    ? path.slice(root.length + 1).replaceAll('\\', '/')
    : path
}

/** Путь - один из списка или лежит внутри одного из них: «a/b» внутри «a», «ab» - нет. */
export const isInsideAny = (path: string, roots: readonly string[]): boolean =>
  roots.some((root) => path === root || path.startsWith(`${root}/`))

/** Где окажется путь после переноса from → to: сам он или то, что внутри, - на новом месте. */
export const movedPathOf = (path: string, from: string, to: string): string =>
  isInsideAny(path, [from]) ? to + path.slice(from.length) : path

/**
 * Нельзя ли дать файлу такое имя: черта увела бы его в другую папку, а на Windows имя не
 * берёт ещё и `\ : * ? " < > |` - система такой файл не создаст.
 */
export const isBadFileName = (name: string): boolean =>
  IS_MAC ? name.includes('/') : /[\\/:*?"<>|]/.test(name)
