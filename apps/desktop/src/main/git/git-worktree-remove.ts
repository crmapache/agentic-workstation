import { git } from './git-runner'
import {
  gitOrFail,
  isPresent,
  gitDetailOf,
  branchExists,
  WORKTREES_ROOT,
  openProjectRepo,
  assertScenarioBranch,
  removeEmptyProjectFolder,
  WORKTREE_REMOVE_TIMEOUT_MS,
} from './git-worktree-repo'
import { countAhead, assertCommit, WorktreeError, readWorktreeDirty } from './git-worktree-state'
import { queueGitWrite } from './git-write-queue'

/** Что делать с git-веткой worktree при его удалении. */
export type BranchDeletion = 'never' | 'if-merged' | 'always'

type RemoveOptions = {
  path: string
  gitBranch: string
  force: boolean
  deleteBranch: BranchDeletion
  root: string
}

/** Ветка после удаления worktree. -d откажет на неслитой - так и задумано, она остаётся. */
const settleBranch = async (top: string, gitBranch: string, mode: BranchDeletion) => {
  if (mode === 'never' || !(await branchExists(top, gitBranch))) return false

  try {
    await git(top, ['branch', mode === 'always' ? '-D' : '-d', '--', gitBranch])

    return true
  } catch (error) {
    if (mode === 'always') console.warn(`[git] ветка ${gitBranch} не удалилась:`, error)

    return false
  }
}

/** Удаление внутри очереди записи: его зовут и removeWorktree, и removeIfEmpty. */
const removeQueued = async (top: string, options: RemoveOptions) => {
  const { path, gitBranch, force, deleteBranch, root } = options

  if (await isPresent(path)) {
    if (!force && (await readWorktreeDirty(path))) throw new WorktreeError('dirty', path)

    try {
      const remove = ['worktree', 'remove', ...(force ? ['--force'] : []), '--', path]

      await git(top, remove, WORKTREE_REMOVE_TIMEOUT_MS)
    } catch (error) {
      // Между проверкой и удалением агент мог дописать файл - git откажет сам.
      const detail = gitDetailOf(error)
      const dirty = !force && detail.includes('contains modified or untracked files')

      throw new WorktreeError(dirty ? 'dirty' : 'failed', detail)
    }
  }

  // Папку удалили руками - запись о worktree осталась, а с ней git не даёт удалить ветку.
  await gitOrFail(top, ['worktree', 'prune'])

  const branchDeleted = await settleBranch(top, gitBranch, deleteBranch)

  await removeEmptyProjectFolder(path, root)

  return { branchDeleted }
}

/**
 * Удаляет worktree и, по выбору, его ветку. Изменения в нём без force - отказ
 * 'dirty', ничего не тронуто: --force - только после вопроса человеку. Папки уже
 * нет - запись о ней убирается, ветка решается как обычно. 'if-merged' судит о
 * слитости по правилам `git branch -d`: слита в HEAD проекта, а если ветку
 * публиковали с upstream - в её upstream.
 */
export const removeWorktree = async ({
  projectPath,
  root = WORKTREES_ROOT,
  ...options
}: Omit<RemoveOptions, 'root'> & {
  projectPath: string
  root?: string
}): Promise<{ branchDeleted: boolean }> => {
  assertScenarioBranch(options.gitBranch)

  const { top } = await openProjectRepo(projectPath)

  return queueGitWrite(top, () => removeQueued(top, { ...options, root }))
}

/**
 * Удаляет worktree вместе с веткой, если в нём не сделано ничего: ни изменений, ни
 * коммитов поверх основы. -D тут безопасен - своих коммитов у ветки нет. Ветку
 * проверяем отдельно от HEAD worktree: агент мог переключить его на другую, и
 * коммиты в нашей по HEAD не видны. true - удалён; false - есть работа или папки
 * уже нет (что в ветке - не гадаем), ничего не тронуто.
 */
export const removeIfEmpty = async ({
  projectPath,
  path,
  gitBranch,
  baseCommit,
  root = WORKTREES_ROOT,
}: {
  projectPath: string
  path: string
  gitBranch: string
  baseCommit: string
  root?: string
}): Promise<boolean> => {
  assertScenarioBranch(gitBranch)
  assertCommit(baseCommit)

  const { top } = await openProjectRepo(projectPath)

  return queueGitWrite(top, async () => {
    if (!(await isPresent(path)) || (await readWorktreeDirty(path))) return false
    if ((await countAhead(path, baseCommit, 'HEAD')) > 0) return false

    const tip = `refs/heads/${gitBranch}`

    if ((await branchExists(top, gitBranch)) && (await countAhead(top, baseCommit, tip)) > 0) {
      return false
    }

    try {
      await removeQueued(top, { path, gitBranch, force: false, deleteBranch: 'always', root })

      return true
    } catch (error) {
      // Агент успел что-то записать между проверкой и удалением - это уже работа.
      if (error instanceof WorktreeError && error.code === 'dirty') return false
      throw error
    }
  })
}
