import { execFile } from 'node:child_process'
import { delimiter } from 'node:path'
import { promisify } from 'node:util'

import type { GitPullRequest, GitPullRequestState } from '@shared/git'

import { loginShellEnv } from '../process/shell-env'
import { GH_TIMEOUT_MS, GH_FALLBACK_DIRS } from './git.constants'

const run = promisify(execFile)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Состояние PR из ответа gh: черновик у GitHub - флаг поверх открытого. */
const stateOf = (state: unknown, isDraft: unknown): GitPullRequestState | null => {
  if (state === 'MERGED') return 'merged'
  if (state === 'CLOSED') return 'closed'
  if (state === 'OPEN') return isDraft === true ? 'draft' : 'open'

  return null
}

/** Ответ `gh pr view --json number,url,state,isDraft`; не тот вид - PR нет. */
export const parsePullRequest = (stdout: string): GitPullRequest | null => {
  try {
    const value: unknown = JSON.parse(stdout)

    if (!isRecord(value)) return null

    const { number, url } = value
    const state = stateOf(value['state'], value['isDraft'])

    return typeof number === 'number' &&
      typeof url === 'string' &&
      url.startsWith('https://') &&
      state
      ? { number, url, state }
      : null
  } catch {
    return null
  }
}

/**
 * PR текущей ветки проекта. Знание, что ветка уже ушла в PR, живёт на GitHub, а не в
 * репозитории, поэтому спрашиваем `gh`. Ошибка тут - обычное дело (нет удалённого
 * репозитория, нет PR, gh не установлен или не вошёл): тогда null, и в шапке окна
 * PR просто нет, без ошибки. gh ищется в PATH оболочки человека (приложение из Finder получает короткий
 * PATH без Homebrew) и в папках Homebrew.
 */
export const readPullRequest = async (rootPath: string): Promise<GitPullRequest | null> => {
  const env = await loginShellEnv()
  const path = [env['PATH'], ...GH_FALLBACK_DIRS].filter(Boolean).join(delimiter)

  try {
    const { stdout } = await run('gh', ['pr', 'view', '--json', 'number,url,state,isDraft'], {
      cwd: rootPath,
      timeout: GH_TIMEOUT_MS,
      env: { ...env, PATH: path, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
    })

    return parsePullRequest(stdout)
  } catch {
    return null
  }
}
