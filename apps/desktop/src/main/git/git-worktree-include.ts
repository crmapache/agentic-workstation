import { execFile } from 'node:child_process'
import { stat, lstat, mkdir, copyFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { promisify } from 'node:util'

import { RecordReader } from '../search/record-reader'
import { exitCodeOf } from './git-output'
import { streamGit } from './git-stream'
import { GIT_ENV_OVERRIDES, GIT_LOCAL_TIMEOUT_MS } from './git.constants'

const run = promisify(execFile)

/** Файл в корне репозитория со списком того, что копировать в новый worktree (формат Claude Code). */
export const WORKTREE_INCLUDE_FILE = '.worktreeinclude'

/**
 * Больше файлов не копируем: шаблон вроде `node_modules/` дал бы сотни тысяч файлов
 * и минуты копирования, а зависимости агент ставит в worktree сам.
 */
export const WORKTREE_INCLUDE_LIMIT = 2_000

/**
 * Без правил .gitignore обход неотслеживаемого заходит и в node_modules - в большом
 * репозитории это секунда-две, с холодным диском дольше.
 */
const LIST_TIMEOUT_MS = 60_000

/** Ответ check-ignore - до лимита путей; длинные пути не должны упереться в буфер execFile. */
const CHECK_IGNORE_MAX_BUFFER = 16 * 1024 * 1024

const isRegularFile = async (path: string) => {
  try {
    return (await lstat(path)).isFile()
  } catch {
    return false
  }
}

const isPresent = async (path: string) => {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/**
 * Неотслеживаемые файлы, совпавшие с шаблонами .worktreeinclude. Без
 * --exclude-standard намеренно: с ним правила .gitignore добавились бы к шаблонам
 * (объединение), а нужно пересечение - его даёт check-ignore следующим шагом.
 * Читаем на один путь больше лимита - чтобы знать, что список обрезан.
 */
const listCandidates = async (repoRoot: string, includeFile: string) => {
  const reader = new RecordReader([0])
  const paths: string[] = []
  const outcome = await streamGit(
    repoRoot,
    ['ls-files', '-z', '--others', '--ignored', `--exclude-from=${includeFile}`],
    {
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
      onData: (chunk) => {
        for (const { fields } of reader.push(chunk)) paths.push(fields[0] ?? '')

        return paths.length <= WORKTREE_INCLUDE_LIMIT
      },
    },
  )

  if (outcome.kind === 'finished' && outcome.exitCode !== 0) {
    throw new Error(`git ls-files завершился с кодом ${outcome.exitCode}: ${outcome.stderr}`)
  }

  return { paths: paths.slice(0, WORKTREE_INCLUDE_LIMIT), truncated: outcome.kind === 'stopped' }
}

/** Из путей - только те, что игнорирует сам репозиторий (.gitignore, info/exclude, глобальный). */
const keepIgnored = async (repoRoot: string, paths: string[]): Promise<string[]> => {
  if (paths.length === 0) return []

  const pending = run('git', ['check-ignore', '-z', '--stdin'], {
    cwd: repoRoot,
    timeout: GIT_LOCAL_TIMEOUT_MS,
    maxBuffer: CHECK_IGNORE_MAX_BUFFER,
    env: { ...process.env, ...GIT_ENV_OVERRIDES },
  })

  // git, который не дочитал ввод (не запустился, упал), даёт EPIPE на stdin. Без
  // обработчика это необработанное событие потока - оно уронило бы главный процесс.
  pending.child.stdin?.on('error', () => undefined)
  pending.child.stdin?.end(paths.map((path) => `${path}\0`).join(''))

  try {
    const { stdout } = await pending

    return stdout.split('\0').filter((path) => path.length > 0)
  } catch (error) {
    // 1 - ни один путь не игнорируется: копировать нечего.
    if (exitCodeOf(error) === 1) return []
    throw error
  }
}

/**
 * Копирует в новый worktree игнорируемые файлы, перечисленные в .worktreeinclude
 * корня репозитория (`.env`, `.env.local`): checkout их не приносит, а без них
 * сценарий не запустит проект. Отслеживаемые файлы не копируются никогда - их
 * версия из коммита уже в worktree, правки в проекте туда не переносятся. Ссылки и
 * папки пропускаются: копируем только обычные файлы.
 *
 * Сбой копирования не отменяет worktree: он уже рабочий, а причину пишем в журнал.
 * Итог - сколько файлов скопировано.
 */
export const copyWorktreeInclude = async (repoRoot: string, worktreePath: string) => {
  const includeFile = join(repoRoot, WORKTREE_INCLUDE_FILE)

  if (!(await isPresent(includeFile))) return 0

  try {
    const { paths, truncated } = await listCandidates(repoRoot, includeFile)

    if (truncated) {
      console.warn(
        `[git] .worktreeinclude: совпало больше ${WORKTREE_INCLUDE_LIMIT} файлов или обход не уложился во время, копируем только начало списка`,
      )
    }

    let copied = 0

    for (const relative of await keepIgnored(repoRoot, paths)) {
      const source = join(repoRoot, relative)

      if (!(await isRegularFile(source))) continue

      const target = join(worktreePath, relative)

      try {
        await mkdir(dirname(target), { recursive: true })
        await copyFile(source, target)
        copied += 1
      } catch (error) {
        console.warn(`[git] .worktreeinclude: не скопировался ${relative}:`, error)
      }
    }

    return copied
  } catch (error) {
    console.warn('[git] .worktreeinclude не разобрался, в worktree ничего не скопировано:', error)

    return 0
  }
}
