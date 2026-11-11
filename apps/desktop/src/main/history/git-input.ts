import { spawn } from 'node:child_process'

import { GIT_ENV_OVERRIDES, GIT_LOCAL_TIMEOUT_MS } from '../git/git.constants'

/**
 * Команда git со списком на входе (cat-file, check-ignore): код выхода и вывод целиком. Не
 * запустилась (нет git), упала или не уложилась во время - null: история обходится без git.
 */
export const gitWithInput = (cwd: string, args: readonly string[], input: string) =>
  new Promise<{ code: number; stdout: Buffer } | null>((resolve) => {
    const child = spawn('git', args, {
      cwd,
      env: { ...process.env, ...GIT_ENV_OVERRIDES },
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: GIT_LOCAL_TIMEOUT_MS,
    })
    const chunks: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.on('error', () => resolve(null))
    child.on('close', (code) =>
      resolve(code === null ? null : { code, stdout: Buffer.concat(chunks) }),
    )
    // Вход оборвался (git вышел раньше) - ответ решит код выхода.
    child.stdin.on('error', () => undefined)
    child.stdin.end(input)
  })
