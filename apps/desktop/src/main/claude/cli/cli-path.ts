import { execFile } from 'node:child_process'
import { isAbsolute } from 'node:path'

import type { CliPathRefusal } from '@shared/panel-extras'

import { IS_WINDOWS } from '../../platform'
import { launchablePath, isExecutableFile } from '../../process/binary-locator'
import { commandDirs, candidatesIn } from '../../process/cli-search'
import type { Environment } from '../../process/shell-env'
import { CLAUDE_COMMAND, CLI_PROBE_TIMEOUT_MS } from './cli.constants'

/** Как CLI называет себя в `--version`: «2.1.293 (Claude Code)». */
const CLAUDE_VERSION = /\(Claude Code\)/

/** Путь, названный руками: программа для запуска или почему он не годится. */
export type CliPathCheck =
  { binary: string; refusal: null } | { binary: null; refusal: CliPathRefusal }

const versionOf = (file: string, env: Environment) =>
  new Promise<string>((resolve) => {
    execFile(
      file,
      ['--version'],
      { env, timeout: CLI_PROBE_TIMEOUT_MS, encoding: 'utf8' },
      (_e, out) => resolve(out),
    )
  })

/**
 * Путь к CLI, названный руками: файла нет (или он не исполняемый) - missing; отвечает не
 * как Claude Code - not-claude; годный - программа для запуска. На Windows человек чаще всего
 * берёт путь из `where claude` - обёртку npm `claude.cmd`: её заменяет её claude.exe, а
 * обёртка над скриптом (старый пакет npm) - не Claude Code, который IDE может запустить.
 * Окну не верим: путь мог прийти из настроек.
 */
export const checkCliPath = async (path: string, env: Environment): Promise<CliPathCheck> => {
  if (!isAbsolute(path) || !(await isExecutableFile(path))) {
    return { binary: null, refusal: 'missing' }
  }

  const binary = await launchablePath(path, env)

  return binary && CLAUDE_VERSION.test(await versionOf(binary, env))
    ? { binary, refusal: null }
    : { binary: null, refusal: 'not-claude' }
}

/**
 * Где панель искала CLI - для экрана «Claude Code not found»: путь, названный руками,
 * каждый кандидат в папках PATH терминала (на Windows - ещё в папках установщиков) и сама
 * оболочка входа (`command -v`).
 */
export const searchedPlaces = (
  env: Environment,
  configured: string,
  windows = IS_WINDOWS,
): string[] => [
  ...(configured ? [configured] : []),
  ...candidatesIn(commandDirs(env, windows), CLAUDE_COMMAND, windows),
  ...(windows ? [] : [`command -v ${CLAUDE_COMMAND}`]),
]
