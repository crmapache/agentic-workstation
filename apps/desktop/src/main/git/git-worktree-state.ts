import { execFile } from 'node:child_process'
import { lstat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { promisify } from 'node:util'

import { stderrOf, summarizeGitError } from './git-output'
import { streamGit } from './git-stream'
import { GIT_STATUS_ENV, GIT_LOCAL_TIMEOUT_MS, GIT_STATUS_TIMEOUT_MS } from './git.constants'

const run = promisify(execFile)

/**
 * Причина отказа, понятная окну: 'not-a-repo' - проект не в git, 'no-commits' -
 * в репозитории нет ни одного коммита, 'dirty' - в worktree несохранённая работа,
 * 'missing' - папки проекта нет, 'failed' - остальное (ответ git - в message).
 */
export type WorktreeErrorCode = 'not-a-repo' | 'no-commits' | 'dirty' | 'missing' | 'failed'

/** Человеку окно покажет свой перевод по code; message с ответом git - для журнала. */
export class WorktreeError extends Error {
  constructor(
    readonly code: WorktreeErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'WorktreeError'
  }
}

export type WorktreeState = { exists: boolean; dirty: boolean; commitsAhead: number }

/** Полный хеш: SHA-1 или SHA-256. Сокращение или имя ветки сюда не годятся. */
const COMMIT_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/

/** Хеш приходит из сохранённой очереди и идёт в аргументы git - опцией он стать не должен. */
export const assertCommit = (commit: string) => {
  if (!COMMIT_PATTERN.test(commit)) throw new WorktreeError('failed', `not a commit: "${commit}"`)
}

/**
 * Окружение команд внутри worktree. Без попутной записи индекса (как у статуса
 * дерева) и с потолком поиска репозитория на папке над worktree: если .git в нём
 * сломан, git не поднимется выше и не ответит за чужой репозиторий - например,
 * домашнюю папку с dotfiles.
 */
const insideEnv = (path: string) => ({ ...GIT_STATUS_ENV, GIT_CEILING_DIRECTORIES: dirname(path) })

/**
 * Есть ли в worktree несохранённая работа: правки и новые файлы, игнорируемые не в
 * счёт - как у `git worktree remove`. Новые файлы показываем явно, даже если
 * настройка status.showUntrackedFiles их прячет: потерять новый файл агента хуже,
 * чем лишний раз спросить. Хватает первого байта ответа - дальше git не ждём.
 */
export const readWorktreeDirty = async (path: string): Promise<boolean> => {
  let sawOutput = false
  const args = ['status', '--porcelain', '--untracked-files=normal', '--ignore-submodules=none']
  const outcome = await streamGit(path, args, {
    signal: AbortSignal.timeout(GIT_STATUS_TIMEOUT_MS),
    env: insideEnv(path),
    onData: () => {
      sawOutput = true

      return false
    },
  })

  if (sawOutput) return true
  if (outcome.kind === 'finished' && outcome.exitCode === 0) return false

  const detail = outcome.kind === 'finished' ? outcome.stderr : 'git status timed out'

  throw new WorktreeError('failed', summarizeGitError(detail))
}

/** Сколько коммитов в tip поверх основы. cwd - worktree или корень репозитория. */
export const countAhead = async (cwd: string, baseCommit: string, tip: string) => {
  try {
    const { stdout } = await run('git', ['rev-list', '--count', `${baseCommit}..${tip}`], {
      cwd,
      timeout: GIT_LOCAL_TIMEOUT_MS,
      env: { ...process.env, ...insideEnv(cwd) },
    })

    return Number.parseInt(stdout.trim(), 10)
  } catch (error) {
    throw new WorktreeError('failed', summarizeGitError(stderrOf(error)))
  }
}

/**
 * Что в worktree сейчас: есть ли папка, несохранённая работа и коммиты поверх
 * основы. Папки нет - всё пусто. Папка есть, а git её не узнаёт (сломан .git) -
 * отказ 'failed': гадать «чисто» нельзя, по этому ответу решают, удалять ли.
 */
export const worktreeState = async (path: string, baseCommit: string): Promise<WorktreeState> => {
  assertCommit(baseCommit)

  try {
    await lstat(path)
  } catch {
    return { exists: false, dirty: false, commitsAhead: 0 }
  }

  const [dirty, commitsAhead] = await Promise.all([
    readWorktreeDirty(path),
    countAhead(path, baseCommit, 'HEAD'),
  ])

  return { exists: true, dirty, commitsAhead }
}
