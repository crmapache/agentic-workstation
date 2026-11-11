import { stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'

/** Проект папки, где шла работа: путь проекта или null - не определить. */
export type ProjectOf = (cwd: string) => Promise<string | null> | string | null

const hasGit = async (dir: string): Promise<boolean> =>
  (await stat(join(dir, '.git')).catch(() => null)) !== null

const findRoot = async (cwd: string): Promise<string> => {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (await hasGit(dir)) return dir
    // Дошли до корня диска без .git - проект и есть сама папка.
    if (dirname(dir) === dir) return cwd
  }
}

/**
 * Проект по умолчанию: ближайшая папка выше с .git (у worktree это файл - тоже подходит),
 * иначе сама папка. Ответы запоминаются: папок сотни, а спрашивают их на каждом проходе.
 */
export const nearestGitRoot = (): ProjectOf => {
  const known = new Map<string, Promise<string>>()

  return (cwd) => {
    const cached = known.get(cwd)

    if (cached) return cached

    const found = findRoot(cwd)

    known.set(cwd, found)

    return found
  }
}
