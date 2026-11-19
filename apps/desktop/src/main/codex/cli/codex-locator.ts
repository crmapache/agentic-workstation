import { IS_WINDOWS } from '../../platform'
import {
  runQuiet,
  askShellFor,
  findBinaryInPath,
  isExecutableFile,
} from '../../process/binary-locator'
import type { Environment } from '../../process/shell-env'
import { loginShellEnv } from '../../process/shell-env'

/** Имя исполняемого файла Codex CLI. */
export const CODEX_BINARY = IS_WINDOWS ? 'codex.exe' : 'codex'

/** Codex на машине: путь, окружение login shell и версия (пусто - не назвал). */
export type CodexCli = { binary: string; env: Environment; version: string }

/** Версия из `codex --version` («codex-cli 0.163.0»); не та строка - пусто. */
export const parseCodexVersion = (text: string): string =>
  /codex-cli\s+(\d+\.\d+\.\d+)/.exec(text)?.[1] ?? ''

/** Версия a не младше b (по числам «x.y.z»); неизвестная - младше всех. */
export const isAtLeast = (version: string, minimum: string): boolean => {
  if (!version) return false

  const left = version.split('.').map(Number)
  const right = minimum.split('.').map(Number)

  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)

    if (difference !== 0) return difference > 0
  }

  return true
}

/**
 * Найти Codex: путь, названный руками (если он исполняемый), иначе PATH login shell, иначе
 * спросить саму оболочку. Ищется заново на каждый вопрос: его могли поставить, пока IDE
 * открыта. null - Codex на машине нет.
 */
export const locateCodexCli = async (configured = ''): Promise<CodexCli | null> => {
  const env = await loginShellEnv()
  const named = configured && (await isExecutableFile(configured)) ? configured : null
  const binary =
    named ??
    (await findBinaryInPath(env['PATH'] ?? '', CODEX_BINARY)) ??
    (await askShellFor(CODEX_BINARY, env))

  if (!binary) return null

  return { binary, env, version: parseCodexVersion(await runQuiet(binary, ['--version'], env)) }
}
