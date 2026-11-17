import type { GitHead } from '@shared/git'

import { exitCodeOf } from './git-output'
import { git } from './git-runner'

/**
 * Текущая ветка проекта. null - папка не в репозитории или git недоступен: тогда
 * шапка просто не показывает ветку. Папка внутри чужого репозитория показывает его
 * ветку - так же ведёт себя и сам git.
 */
export const readHead = async (rootPath: string): Promise<GitHead | null> => {
  try {
    const { stdout } = await git(rootPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'])

    return { kind: 'branch', name: stdout.trim() }
  } catch (error) {
    // Код 1 - HEAD не на ветке. Всё остальное (128 - не репозиторий, ENOENT - нет
    // git) значит, что ветки нет вовсе.
    if (exitCodeOf(error) !== 1) return null
  }

  try {
    const { stdout } = await git(rootPath, ['rev-parse', '--short', 'HEAD'])

    return { kind: 'detached', commit: stdout.trim() }
  } catch {
    return null
  }
}

/**
 * Есть ли коммит: у нового репозитория HEAD ещё никуда не указывает (код 1 при -q). Другой
 * отказ git - исключение: «коммитов нет» он не значит.
 */
export const hasCommits = async (rootPath: string): Promise<boolean> => {
  try {
    await git(rootPath, ['rev-parse', '--verify', '-q', 'HEAD^{commit}'])

    return true
  } catch (error) {
    if (exitCodeOf(error) === 1) return false

    throw error
  }
}
