import { sep, dirname, resolve, relative, isAbsolute } from 'node:path'

import { IS_WINDOWS } from '../platform'
import { git } from '../git/git-runner'

/**
 * Что вокруг проекта-подпапки репозитория надо слушать отдельно. gitDir - папка .git,
 * если она вне корня проекта (или папка worktree). ignoreDirs - папки от корня
 * репозитория до той, что прямо над проектом: их .gitignore тоже красят файлы проекта.
 */
export type RepoSurroundings = { gitDir: string | null; ignoreDirs: string[] }

const NONE: RepoSurroundings = { gitDir: null, ignoreDirs: [] }

const isOutside = (rootPath: string, path: string): boolean => {
  const fromRoot = relative(rootPath, path)

  return fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)
}

/**
 * Одна ли это папка. git на Windows печатает `C:/x`, а путь проекта - `C:\x`, и диск бывает
 * в любом регистре: сравнивается путь, приведённый системой, без учёта регистра.
 */
const isSameFolder = (a: string, b: string): boolean =>
  IS_WINDOWS ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : a === b

/** Папки от верха репозитория до родителя проекта, сверху вниз. Проект - корень: пусто. */
export const foldersAbove = (topLevel: string, rootPath: string): string[] => {
  const folders: string[] = []

  for (let folder = dirname(rootPath); !isOutside(topLevel, folder); folder = dirname(folder)) {
    folders.unshift(folder)

    if (isSameFolder(folder, topLevel)) break
  }

  return isSameFolder(rootPath, topLevel) ? [] : folders
}

/** Спросить git, где .git и верх репозитория. Не репозиторий или git нет - слушать нечего. */
export const readRepoSurroundings = async (rootPath: string): Promise<RepoSurroundings> => {
  try {
    const { stdout } = await git(rootPath, ['rev-parse', '--absolute-git-dir', '--show-toplevel'])
    const [gitDir = '', topLevel = ''] = stdout.split('\n')

    if (!gitDir || !topLevel) return NONE

    return {
      gitDir: isOutside(rootPath, gitDir) ? gitDir : null,
      ignoreDirs: foldersAbove(topLevel, rootPath),
    }
  } catch {
    return NONE
  }
}
