import { stat, readdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { loginShellEnv } from '../../process/shell-env'
import { SLUG_MAX_CHARS } from './history.constants'

/**
 * Дом CLI: CLAUDE_CONFIG_DIR или ~/.claude - из того окружения, с которым CLI
 * запускается (login shell). Переменная из .zshrc приложению из Finder не видна, а CLI -
 * видна, и транскрипты лежат там, где их пишет он.
 */
export const claudeHome = async (): Promise<string> => {
  const env = await loginShellEnv()

  return env['CLAUDE_CONFIG_DIR'] || join(env['HOME'] || homedir(), '.claude')
}

/**
 * Имя папки проекта в projects/ - как его делает CLI 2.1.293: всё, что не латинская
 * буква и не цифра, - дефис. Длиннее SLUG_MAX_CHARS CLI обрезает и дописывает хеш -
 * такую папку ищем по началу имени.
 */
export const projectSlug = (path: string): string => path.replace(/[^a-zA-Z0-9]/g, '-')

const slugDirs = async (projects: string, path: string) => {
  const slug = projectSlug(path)

  if (slug.length <= SLUG_MAX_CHARS) return [join(projects, slug)]

  const prefix = slug.slice(0, SLUG_MAX_CHARS)
  const names = await readdir(projects).catch(() => [])

  return names.filter((name) => name.startsWith(prefix)).map((name) => join(projects, name))
}

/**
 * Папки транскриптов проекта. Путь и его настоящий путь дают разные имена (/tmp -
 * /private/tmp, ссылки), а CLI пишет туда, где его запустили, - смотрим обе.
 */
export const transcriptDirs = async (rootPath: string): Promise<string[]> => {
  const real = await realpath(rootPath).catch(() => rootPath)
  const projects = join(await claudeHome(), 'projects')
  const dirs = await Promise.all(
    [...new Set([rootPath, real])].map((path) => slugDirs(projects, path)),
  )

  return [...new Set(dirs.flat())]
}

/** Файл транскрипта сессии или null, если CLI его ещё не записал. */
export const findTranscript = async (rootPath: string, sessionId: string) => {
  for (const dir of await transcriptDirs(rootPath)) {
    const file = join(dir, `${sessionId}.jsonl`)
    const info = await stat(file).catch(() => null)

    if (info?.isFile()) return file
  }

  return null
}
