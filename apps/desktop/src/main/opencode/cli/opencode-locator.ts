import { IS_WINDOWS } from '../../platform'
import {
  runQuiet,
  askShellFor,
  findBinaryInPath,
  isExecutableFile,
} from '../../process/binary-locator'
import type { Environment } from '../../process/shell-env'
import { loginShellEnv } from '../../process/shell-env'

/** Имя исполняемого файла OpenCode. */
export const OPENCODE_BINARY = IS_WINDOWS ? 'opencode.exe' : 'opencode'

/** OpenCode на машине: путь, окружение login shell и версия (пусто - не назвал). */
export type OpenCodeCli = { binary: string; env: Environment; version: string }

/** Версия из `opencode --version` («opencode v2.3.2»); не та строка - пусто. */
export const parseOpenCodeVersion = (text: string): string =>
  /opencode\s+v?(\d+\.\d+\.\d+)/i.exec(text)?.[1] ?? ''

/**
 * Найти OpenCode: PATH login shell (Homebrew, npm), иначе спросить саму оболочку. Ищется
 * заново на каждый вопрос: его могли поставить, пока IDE открыта. null - OpenCode на машине нет.
 */
export const locateOpenCodeCli = async (): Promise<OpenCodeCli | null> => {
  const env = await loginShellEnv()
  const binary =
    (await findBinaryInPath(env['PATH'] ?? '', OPENCODE_BINARY)) ??
    (await askShellFor(OPENCODE_BINARY, env))

  if (!binary || !(await isExecutableFile(binary))) return null

  return { binary, env, version: parseOpenCodeVersion(await runQuiet(binary, ['--version'], env)) }
}
