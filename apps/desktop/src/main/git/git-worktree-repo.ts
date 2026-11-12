import { stat, lstat, rmdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'

import { isGitScope } from '../search/git-scope'
import { stderrOf, exitCodeOf, summarizeGitError } from './git-output'
import { git } from './git-runner'
import { WorktreeError } from './git-worktree-state'

/**
 * Где живут worktree очередей сценариев: вне проекта (иначе vitest и eslint проекта
 * подхватили бы копии) и без пробелов в пути - часть инструментов их не переносит.
 */
export const WORKTREES_ROOT = join(homedir(), '.agentic-workstation', 'worktrees')

/** Удаление worktree с зависимостями, которые поставил агент, - сотни тысяч файлов. */
export const WORKTREE_REMOVE_TIMEOUT_MS = 5 * 60 * 1000

/** Все ветки worktree сценариев живут под одним префиксом - по нему их и узнаём. */
export const SCENARIO_BRANCH_PREFIX = 'scenarios/'

/** После суффикса -2…-50 имя длиннее исходного slug, поэтому предел здесь шире. */
const SCENARIO_BRANCH_PATTERN = /^scenarios\/[a-z0-9][a-z0-9-]{0,60}$/

/**
 * Имя ветки приходит из сохранённой очереди и идёт в `git branch -D`: удалять так
 * разрешено только ветки сценариев, а не main по ошибке в записи.
 */
export const assertScenarioBranch = (gitBranch: string) => {
  if (!SCENARIO_BRANCH_PATTERN.test(gitBranch)) {
    throw new WorktreeError('failed', `not a scenario branch: "${gitBranch}"`)
  }
}

export const isPresent = async (path: string) => {
  try {
    await lstat(path)

    return true
  } catch {
    return false
  }
}

export const isDirectory = async (path: string) => {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** Что ответил git - в message отказа, для журнала. */
export const gitDetailOf = (error: unknown) => summarizeGitError(stderrOf(error))

/** git-команда, сбой которой - отказ всей операции. */
export const gitOrFail = async (cwd: string, args: string[]) => {
  try {
    return (await git(cwd, args)).stdout
  } catch (error) {
    throw new WorktreeError('failed', gitDetailOf(error))
  }
}

/** Корень репозитория и путь проекта от него (`apps/desktop/` или пусто). */
export type ProjectRepo = { top: string; prefix: string }

/**
 * Репозиторий проекта. Проект в папке, которую игнорирует объемлющий репозиторий
 * (домашняя папка - репозиторий dotfiles с `*`), для нас не в git: иначе worktree
 * вышел бы из чужого огромного репозитория.
 */
export const openProjectRepo = async (projectPath: string): Promise<ProjectRepo> => {
  if (!(await isDirectory(projectPath))) throw new WorktreeError('missing', projectPath)

  let output: string

  try {
    ;({ stdout: output } = await git(projectPath, [
      'rev-parse',
      '--show-toplevel',
      '--show-prefix',
    ]))
  } catch (error) {
    // 128 - не рабочее дерево git; остальное (git не запустился) - сбой.
    const code = exitCodeOf(error) === 128 ? 'not-a-repo' : 'failed'

    throw new WorktreeError(code, gitDetailOf(error))
  }

  if (!(await isGitScope(projectPath))) throw new WorktreeError('not-a-repo', 'ignored by git')

  // Только перевод строки: пробел в конце имени папки - часть имени.
  const [top = '', prefix = ''] = output.split('\n')

  return { top, prefix }
}

export const branchExists = async (top: string, gitBranch: string) => {
  try {
    await git(top, ['rev-parse', '--verify', '--quiet', `refs/heads/${gitBranch}`])

    return true
  } catch (error) {
    // 1 - такой ссылки нет; остальное - git не ответил.
    if (exitCodeOf(error) === 1) return false
    throw new WorktreeError('failed', gitDetailOf(error))
  }
}

/**
 * Пустая папка проекта под корнем worktree - мусор после последнего удалённого.
 * Чужие папки не трогаем: только прямо под корнем, и rmdir не удалит непустую.
 */
export const removeEmptyProjectFolder = async (path: string, root: string) => {
  const folder = dirname(path)
  const roots = [resolve(root), await realpath(root).catch(() => resolve(root))]

  if (roots.includes(dirname(folder))) await rmdir(folder).catch(() => undefined)
}
