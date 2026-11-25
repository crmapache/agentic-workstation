import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { open, stat, access } from 'node:fs/promises'

import { IS_WINDOWS } from '../platform'
import { launchTarget } from '../windows/cmd-launch'
import type { CliLaunch, CliSearchDeps } from './cli-search'
import { commandDirs, launchableOf, findCommandIn } from './cli-search'
import type { Environment } from './shell-env'

/** Сколько ждать `command -v` и `--version` у CLI. */
export const PROBE_TIMEOUT_MS = 5_000

/** Сколько читать от обёртки `.cmd`: строка запуска npm - в первых сотнях байт, у pnpm перед ней NODE_PATH. */
const SHIM_READ_BYTES = 64 * 1024

/** Есть ли исполняемый файл по пути: CLI на месте и его можно запустить. */
export const isExecutableFile = async (file: string): Promise<boolean> => {
  try {
    await access(file, constants.X_OK)

    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

/** Начало файла текстом; не читается - пусто. Целиком не читается: рядом с обёртками - программы на сотни мегабайт. */
const readHead = async (file: string): Promise<string> => {
  try {
    const handle = await open(file, 'r')

    try {
      const buffer = Buffer.alloc(SHIM_READ_BYTES)
      const { bytesRead } = await handle.read(buffer, 0, SHIM_READ_BYTES, 0)

      return buffer.subarray(0, bytesRead).toString('utf8')
    } finally {
      await handle.close()
    }
  } catch {
    return ''
  }
}

/** Эта машина для поиска команд: настоящие файлы. */
export const machineSearch = (env: Environment): CliSearchDeps => ({
  windows: IS_WINDOWS,
  env,
  isFile: isExecutableFile,
  readText: readHead,
})

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

/**
 * Команда в папках PATH, на Windows - ещё в папках установщиков (`WINDOWS_CLI_DIRS`), с
 * расширениями PATHEXT и обёрткой npm, заменённой её программой; нет - null. Оболочку не
 * спрашивает: имя может прийти от расширения и стать кодом в `sh -c`.
 */
export const findCommand = (
  name: string,
  env: Environment,
  launch: CliLaunch = 'program',
): Promise<string | null> =>
  findCommandIn(name, commandDirs(env, IS_WINDOWS), machineSearch(env), launch)

/**
 * Путь, названный человеком, в виде для запуска: обёртку npm (`claude.cmd`, его показывает
 * `where claude`) - её программой; обёртка не годится - null.
 */
export const launchablePath = (
  file: string,
  env: Environment,
  launch: CliLaunch = 'program',
): Promise<string | null> => launchableOf(file, machineSearch(env), launch)

/**
 * Спросить login shell: у CLI, поставленных менеджерами версий, путь появляется только после
 * профиля оболочки. На Windows такого шага нет - его место занимает PATH из реестра
 * (`loginShellEnv`).
 */
export const askShellFor = async (binary: string, env: Environment): Promise<string | null> => {
  if (IS_WINDOWS) return null

  const answer = (await runQuiet('/bin/sh', ['-lc', `command -v ${binary}`], env)).trim()

  return answer.startsWith('/') && (await isExecutableFile(answer)) ? answer : null
}
