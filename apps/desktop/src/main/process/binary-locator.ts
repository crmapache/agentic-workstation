import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { stat, access } from 'node:fs/promises'
import { join, delimiter } from 'node:path'

import { IS_WINDOWS } from '../platform'
import { launchTarget } from '../windows/cmd-launch'
import type { Environment } from './shell-env'

/** Сколько ждать `command -v` и `--version` у CLI. */
export const PROBE_TIMEOUT_MS = 5_000

/** Есть ли исполняемый файл по пути: CLI на месте и его можно запустить. */
export const isExecutableFile = async (file: string): Promise<boolean> => {
  try {
    await access(file, constants.X_OK)

    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

/**
 * Вывод команды или пусто: CLI, который не ответил вовремя, - тот же «нет ответа». Обёртка
 * `.cmd` на Windows (CLI из npm) - через cmd.exe (`launchTarget`).
 */
export const runQuiet = (file: string, args: string[], env: Environment): Promise<string> =>
  new Promise<string>((resolve) => {
    const target = launchTarget(file, args)

    execFile(
      target.file,
      target.args,
      {
        env,
        timeout: PROBE_TIMEOUT_MS,
        encoding: 'utf8',
        windowsVerbatimArguments: target.verbatim,
      },
      (_error, stdout) => resolve(stdout),
    )
  })

/** Исполняемый файл в папках PATH; нет - null. */
export const findBinaryInPath = async (path: string, binary: string): Promise<string | null> => {
  for (const dir of path.split(delimiter)) {
    if (dir && (await isExecutableFile(join(dir, binary)))) return join(dir, binary)
  }

  return null
}

/**
 * Спросить login shell: у CLI, поставленных менеджерами версий, путь появляется только после
 * профиля оболочки. На Windows такого шага нет.
 */
export const askShellFor = async (binary: string, env: Environment): Promise<string | null> => {
  if (IS_WINDOWS) return null

  const answer = (await runQuiet('/bin/sh', ['-lc', `command -v ${binary}`], env)).trim()

  return answer.startsWith('/') && (await isExecutableFile(answer)) ? answer : null
}
