import { stat } from 'node:fs/promises'

import { runQuiet, askShellFor, findBinaryInPath } from '../../process/binary-locator'
import type { Environment } from '../../process/shell-env'
import { loginShellEnv } from '../../process/shell-env'
import type { CliFeatures } from './cli-features'
import { parseCliFeatures } from './cli-features'
import { checkCliPath } from './cli-path'
import { CLAUDE_BINARY } from './cli.constants'

/** Где нашёлся CLI, с каким окружением его запускать и что он умеет. */
export type ClaudeCli = { binary: string; env: Environment; features: CliFeatures }

const featuresByBinary = new Map<string, Promise<CliFeatures>>()

export const findInPath = (path: string): Promise<string | null> =>
  findBinaryInPath(path, CLAUDE_BINARY)

const readFeatures = async (binary: string, env: Environment) => {
  const key = `${binary}:${(await stat(binary)).mtimeMs}`
  let features = featuresByBinary.get(key)

  if (!features) {
    features = runQuiet(binary, ['--help'], env).then(parseCliFeatures)
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
  const binary =
    named ?? (await findInPath(env['PATH'] ?? '')) ?? (await askShellFor(CLAUDE_BINARY, env))

  if (!binary) return null

  return { binary, env, features: await readFeatures(binary, env) }
}
