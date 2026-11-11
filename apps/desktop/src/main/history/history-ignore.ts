import { lstat } from 'node:fs/promises'
import { join } from 'node:path'

import { SKIPPED_FILE_NAMES, SKIPPED_DIRECTORY_NAMES } from '../search/search.constants'
import { gitWithInput } from './git-input'

/**
 * Вне git - как обход поиска без git: служебные, зависимости, сборки и кэши не нужны - ни
 * внутри них, ни сами такие папки (событие слежения называет и папку «node_modules» целиком).
 * Файл с таким именем («build» без расширения) - нужен: это не папка.
 */
const skippedByName = async (cwd: string, path: string): Promise<boolean> => {
  const parts = path.split('/')
  const last = parts.at(-1) ?? ''

  if (parts.slice(0, -1).some((part) => SKIPPED_DIRECTORY_NAMES.has(part))) return true
  if (SKIPPED_FILE_NAMES.has(last)) return true
  if (!SKIPPED_DIRECTORY_NAMES.has(last)) return false

  return (await lstat(join(cwd, path)).catch(() => null))?.isDirectory() ?? true
}

/** git check-ignore по списку: какие игнорируются. git не ответил - null. */
const gitIgnored = async (cwd: string, paths: readonly string[]): Promise<Set<string> | null> => {
  const output = await gitWithInput(cwd, ['check-ignore', '-z', '--stdin'], `${paths.join('\0')}\0`)

  // 0 - что-то игнорируется, 1 - ничего; остальное (128 - не репозиторий) - не ответ.
  if (!output || (output.code !== 0 && output.code !== 1)) return null

  return new Set(output.stdout.toString('utf8').split('\0').filter(Boolean))
}

/**
 * Какие из новых путей истории не нужны - как список файлов поиска: в git - игнорируемые
 * (.gitignore, info/exclude, глобальный), вне git или когда git не ответил - служебные и
 * тяжёлые папки по имени. Отслеживаемый файл git игнорируемым не считает, даже под правилом.
 */
export const ignoredPaths = async (
  cwd: string,
  paths: readonly string[],
  inGit: boolean,
): Promise<Set<string>> => {
  if (paths.length === 0) return new Set()

  const byGit = inGit ? await gitIgnored(cwd, paths) : null

  if (byGit) return byGit

  const skipped = await Promise.all(paths.map((path) => skippedByName(cwd, path)))

  return new Set(paths.filter((_path, index) => skipped[index]))
}
