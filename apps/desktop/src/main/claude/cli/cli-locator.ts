import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { stat, access } from 'node:fs/promises'
import { join, delimiter } from 'node:path'

import { IS_WINDOWS } from '../../platform'
import type { CliFeatures } from './cli-features'
import { parseCliFeatures } from './cli-features'
import { checkCliPath } from './cli-path'
import { CLAUDE_BINARY, CLI_PROBE_TIMEOUT_MS } from './cli.constants'
import type { Environment } from './shell-env'
import { loginShellEnv } from './shell-env'

/** Где нашёлся CLI, с каким окружением его запускать и что он умеет. */
export type ClaudeCli = { binary: string; env: Environment; features: CliFeatures }

const featuresByBinary = new Map<string, Promise<CliFeatures>>()

const isExecutableFile = async (file: string) => {
  try {
    await access(file, constants.X_OK)

    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

const run = (file: string, args: string[], env: Environment) =>
  new Promise<string>((resolve) => {
    execFile(file, args, { env, timeout: CLI_PROBE_TIMEOUT_MS, encoding: 'utf8' }, (_e, stdout) =>
      resolve(stdout),
    )
  })

/** Первый исполняемый `claude` по списку папок PATH. */
export const findInPath = async (path: string): Promise<string | null> => {
  for (const dir of path.split(delimiter)) {
    if (dir && (await isExecutableFile(join(dir, CLAUDE_BINARY)))) return join(dir, CLAUDE_BINARY)
  }

  return null
}

/**
 * Последний шанс: оболочка сама знает, где CLI (nvm и прочие нестандартные установки). На
 * Windows спрашивать некого: PATH программы и есть PATH терминала, его уже прошли.
 */
const askShell = async (env: Environment) => {
  if (IS_WINDOWS) return null

  const answer = (await run('/bin/sh', ['-lc', `command -v ${CLAUDE_BINARY}`], env)).trim()

  return answer.startsWith('/') && (await isExecutableFile(answer)) ? answer : null
}

/**
 * Что умеет эта версия CLI - по её `--help`, один раз на файл. Неизвестный флаг CLI
 * не прощает: процесс не стартует вовсе.
 */
const readFeatures = async (binary: string, env: Environment) => {
  const key = `${binary}:${(await stat(binary)).mtimeMs}`
  let features = featuresByBinary.get(key)

  if (!features) {
    features = run(binary, ['--help'], env).then(parseCliFeatures)
    featuresByBinary.set(key, features)
  }

  return features
}

/**
 * Ищет Claude Code там, где его видит терминал человека. Не нашёлся - null, окно
 * покажет, как поставить. Сам поиск не кэшируется: CLI могли поставить, пока IDE
 * открыта, и следующая попытка должна его увидеть.
 */
export const locateClaudeCli = async (configured = ''): Promise<ClaudeCli | null> => {
  const env = await loginShellEnv()
  // Путь, названный руками, - первым, но только если он отвечает как Claude Code.
  const named = configured && (await checkCliPath(configured, env)) === null ? configured : null
  const binary = named ?? (await findInPath(env['PATH'] ?? '')) ?? (await askShell(env))

  if (!binary) return null

  return { binary, env, features: await readFeatures(binary, env) }
}
