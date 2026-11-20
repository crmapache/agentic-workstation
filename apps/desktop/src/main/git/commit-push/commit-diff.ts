import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { parseLines } from '../git-output'
import { GIT_ENV_OVERRIDES } from '../git.constants'

const run = promisify(execFile)

/** Сколько патча показать модели: дальше - сводка по файлам, по ней сообщение и так видно. */
export const COMMIT_PATCH_MAX_CHARS = 60_000

/** Сколько прошлых сообщений показать модели как образец стиля репозитория. */
const RECENT_SUBJECTS = 8

/** Большой репозиторий хешируется секунды; потолок - от зависшего git, а не от размера. */
const DIFF_TIMEOUT_MS = 60_000
const DIFF_BUFFER_BYTES = 64 * 1024 * 1024

/** Что уйдёт коммитом - модели словами git: файлы, сводка, патч (обрезанный) и стиль прошлых. */
export type CommitDiff = {
  files: string
  stat: string
  patch: string
  truncated: boolean
  recent: string[]
}

/**
 * Все изменения рабочей папки, как их положит `git add -A`, - во временном индексе
 * (GIT_INDEX_FILE): настоящий индекс человека не трогается, пока сообщение не написано, и
 * отказ ИИ ничего не меняет. Временный начинается копией настоящего - git не перехеширует
 * весь проект; копии нет (репозиторий без индекса) - деревом HEAD или пустым. null - коммитить
 * нечего.
 */
export const readCommitDiff = async (
  rootPath: string,
  hasHead: boolean,
): Promise<CommitDiff | null> => {
  const index = join(tmpdir(), `aw-commit-${randomUUID()}.index`)
  const git = async (args: string[], withIndex = true) =>
    (
      await run('git', args, {
        cwd: rootPath,
        timeout: DIFF_TIMEOUT_MS,
        maxBuffer: DIFF_BUFFER_BYTES,
        env: { ...process.env, ...GIT_ENV_OVERRIDES, ...(withIndex && { GIT_INDEX_FILE: index }) },
      })
    ).stdout

  try {
    const real = resolve(rootPath, (await git(['rev-parse', '--git-path', 'index'], false)).trim())
    const copied = await copyFile(real, index).then(
      () => true,
      () => false,
    )

    if (!copied) await git(['read-tree', hasHead ? 'HEAD' : '--empty'])

    await git(['add', '-A'])

    const files = (await git(['diff', '--cached', '--name-status'])).trim()

    if (!files) return null

    const stat = (await git(['diff', '--cached', '--stat=120'])).trim()
    // Патч огромного коммита не влезет в буфер - тогда модели хватит файлов и сводки.
    const whole = await git(['diff', '--cached', '--no-color', '--no-ext-diff', '-U2']).catch(
      () => '',
    )
    const recent = hasHead
      ? parseLines(await git(['log', `-${RECENT_SUBJECTS}`, '--format=%s'], false))
      : []

    return {
      files,
      stat,
      patch: whole.slice(0, COMMIT_PATCH_MAX_CHARS),
      truncated: whole.length > COMMIT_PATCH_MAX_CHARS || whole === '',
      recent,
    }
  } finally {
    await rm(index, { force: true })
  }
}
