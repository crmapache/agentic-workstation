import { createHash } from 'node:crypto'
import { rm, mkdir, realpath } from 'node:fs/promises'
import { join, dirname, resolve, basename } from 'node:path'

import { exitCodeOf } from './git-output'
import { git } from './git-runner'
import { copyWorktreeInclude } from './git-worktree-include'
import {
  gitOrFail,
  isPresent,
  gitDetailOf,
  isDirectory,
  branchExists,
  WORKTREES_ROOT,
  openProjectRepo,
  SCENARIO_BRANCH_PREFIX,
  removeEmptyProjectFolder,
  WORKTREE_REMOVE_TIMEOUT_MS,
} from './git-worktree-repo'
import { WorktreeError } from './git-worktree-state'
import { queueGitWrite } from './git-write-queue'

// Вход модуля worktree очередей сценариев: создание - здесь, остальное собрано из
// частей, чтобы потребителю хватало одного импорта.
export { WORKTREES_ROOT } from './git-worktree-repo'
export { WorktreeError, worktreeState } from './git-worktree-state'
export type { WorktreeErrorCode, WorktreeState } from './git-worktree-state'
export { removeWorktree, removeIfEmpty } from './git-worktree-remove'
export type { BranchDeletion } from './git-worktree-remove'

export type CreatedWorktree = {
  /** Корень worktree, путь без ссылок - так его видят git и cwd процессов в нём. */
  path: string
  /** Папка проекта внутри worktree: совпадает с path, если проект - корень репозитория. */
  projectDir: string
  gitBranch: string
  /** Полный хеш коммита, от которого создан worktree. */
  baseCommit: string
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,50}$/
const MAX_NAME_ATTEMPTS = 50

/** Checkout большого репозитория и хуки post-checkout - это минуты, а не секунды. */
const WORKTREE_ADD_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Папка worktree: имя проекта (только безопасные знаки, без пробелов) и начало хеша
 * пути - два проекта с одним именем из разных мест не делят папку.
 */
export const worktreeFolderFor = (projectPath: string, slug: string, root = WORKTREES_ROOT) => {
  const normalized = resolve(projectPath)
  const name = basename(normalized).replace(/[^A-Za-z0-9._-]/g, '-') || 'project'
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 8)

  return join(root, `${name}-${hash}`, slug)
}

const readHeadCommit = async (top: string) => {
  try {
    const { stdout } = await git(top, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'])

    return stdout.trim()
  } catch (error) {
    // 1 - HEAD ещё никуда не указывает: в репозитории нет ни одного коммита.
    const code = exitCodeOf(error) === 1 ? 'no-commits' : 'failed'

    throw new WorktreeError(code, gitDetailOf(error))
  }
}

/**
 * Пути worktree, о которых знает репозиторий. Папку удалили руками, а запись
 * осталась - `git worktree add` на этот путь откажет, значит путь тоже занят.
 */
const registeredWorktrees = async (top: string) => {
  const stdout = await gitOrFail(top, ['worktree', 'list', '--porcelain'])

  return new Set(
    stdout
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length)),
  )
}

/** Первое свободное имя: slug, slug-2, slug-3… Занято, если есть ветка, папка или запись. */
const pickName = async (top: string, folder: string, slug: string) => {
  const registered = await registeredWorktrees(top)

  for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt += 1) {
    const name = attempt === 1 ? slug : `${slug}-${attempt}`
    const path = join(folder, name)
    const gitBranch = `${SCENARIO_BRANCH_PREFIX}${name}`
    const taken =
      registered.has(path) || (await isPresent(path)) || (await branchExists(top, gitBranch))

    if (!taken) return { path, gitBranch }
  }

  throw new WorktreeError('failed', `no free worktree name for "${slug}"`)
}

/**
 * Откат неудавшегося создания: ни папки, ни записи в .git/worktrees, ни ветки.
 * Ветку создал этот же add (до него её не было) - своих коммитов в ней нет. Папки
 * до add тоже не было, поэтому остаток checkout удаляется целиком.
 */
const discard = async (top: string, path: string, gitBranch: string, root: string) => {
  const quietly = (args: string[]) =>
    git(top, args, WORKTREE_REMOVE_TIMEOUT_MS).catch(() => undefined)

  await quietly(['worktree', 'remove', '--force', '--', path])
  await rm(path, { recursive: true, force: true }).catch(() => undefined)
  await quietly(['worktree', 'prune'])
  await quietly(['branch', '-D', '--', gitBranch])
  await removeEmptyProjectFolder(path, root)
}

/**
 * Новый worktree на новой ветке `scenarios/<slug>` от текущего HEAD проекта.
 * Незакоммиченное в проекте сюда не попадает - кроме игнорируемых файлов из
 * .worktreeinclude. В add идёт хеш, а не HEAD: человек может закоммитить между
 * чтением HEAD и add, а baseCommit должен быть ровно тем, что в worktree.
 * Не удалось - ничего не остаётся наполовину.
 *
 * Очередь записи - по корню репозитория, а не проекта: имя ветки занимается на
 * весь репозиторий, и два проекта из одного репозитория (корень и подпапка) иначе
 * выбрали бы одно имя одновременно.
 */
export const createWorktree = async ({
  projectPath,
  slug,
  root = WORKTREES_ROOT,
}: {
  projectPath: string
  slug: string
  root?: string
}): Promise<CreatedWorktree> => {
  if (!SLUG_PATTERN.test(slug)) throw new WorktreeError('failed', `invalid slug "${slug}"`)

  const repo = await openProjectRepo(projectPath)

  return queueGitWrite(repo.top, async () => {
    const baseCommit = await readHeadCommit(repo.top)
    const wanted = dirname(worktreeFolderFor(projectPath, slug, root))

    await mkdir(wanted, { recursive: true })

    // git хранит пути worktree без ссылок (/var → /private/var): сравнение с его
    // списком и cwd агента в worktree совпадут только с таким же путём.
    const folder = await realpath(wanted)
    const { path, gitBranch } = await pickName(repo.top, folder, slug)

    try {
      const add = ['worktree', 'add', '-b', gitBranch, '--', path, baseCommit]

      await git(repo.top, add, WORKTREE_ADD_TIMEOUT_MS)
    } catch (error) {
      await discard(repo.top, path, gitBranch, root)
      throw new WorktreeError('failed', gitDetailOf(error))
    }

    const projectDir = resolve(path, repo.prefix)

    // Проект - подпапка, которой нет в коммите: сценарию в worktree негде работать.
    if (!(await isDirectory(projectDir))) {
      await discard(repo.top, path, gitBranch, root)
      throw new WorktreeError('failed', `project folder "${repo.prefix}" is not in ${baseCommit}`)
    }

    await copyWorktreeInclude(repo.top, path)

    return { path, projectDir, gitBranch, baseCommit }
  })
}
