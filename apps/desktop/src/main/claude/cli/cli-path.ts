import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { stat, access } from 'node:fs/promises'
import { join, delimiter, isAbsolute } from 'node:path'

import type { CliPathRefusal } from '@shared/claude-panel'

import { IS_WINDOWS } from '../../platform'
import { CLAUDE_BINARY, CLI_PROBE_TIMEOUT_MS } from './cli.constants'
import type { Environment } from './shell-env'

/** Как CLI называет себя в `--version`: «2.1.293 (Claude Code)». */
const CLAUDE_VERSION = /\(Claude Code\)/

const isExecutableFile = async (file: string) => {
  try {
    await access(file, constants.X_OK)

    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

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
 * как Claude Code - not-claude; годный - null. Окну не верим: путь мог прийти из настроек.
 */
export const checkCliPath = async (
  path: string,
  env: Environment,
): Promise<CliPathRefusal | null> => {
  if (!isAbsolute(path) || !(await isExecutableFile(path))) return 'missing'

  return CLAUDE_VERSION.test(await versionOf(path, env)) ? null : 'not-claude'
}

/**
 * Где панель искала CLI - для экрана «Claude Code not found»: путь, названный руками,
 * каждая папка PATH терминала и сама оболочка входа (`command -v`).
 */
export const searchedPlaces = (path: string, configured: string): string[] => [
  ...(configured ? [configured] : []),
  ...[...new Set(path.split(delimiter).filter(Boolean))].map((dir) => join(dir, CLAUDE_BINARY)),
  ...(IS_WINDOWS ? [] : [`command -v ${CLAUDE_BINARY}`]),
]
