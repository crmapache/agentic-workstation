import { runQuiet, askShellFor, findCommand } from '../../process/binary-locator'
import type { Environment } from '../../process/shell-env'
import { loginShellEnv } from '../../process/shell-env'

/**
 * Команда OpenCode. На Windows из npm это обёртка `opencode.cmd` над программой
 * `bin\opencode.exe` - поиск берёт саму программу; обёртку над скриптом запускает cmd.exe.
 */
const OPENCODE_COMMAND = 'opencode'

/** OpenCode на машине: путь, окружение login shell и версия (пусто - не назвал). */
export type OpenCodeCli = { binary: string; env: Environment; version: string }

/** Версия из `opencode --version` («opencode v2.3.2»); не та строка - пусто. */
export const parseOpenCodeVersion = (text: string): string =>
  /opencode\s+v?(\d+\.\d+\.\d+)/i.exec(text)?.[1] ?? ''

/**
 * Найти OpenCode: PATH login shell (Homebrew, npm; на Windows - ещё папки winget, npm, Scoop),
 * иначе спросить саму оболочку. Ищется заново на каждый вопрос: его могли поставить, пока IDE
 * открыта. null - OpenCode на машине нет.
 */
export const locateOpenCodeCli = async (): Promise<OpenCodeCli | null> => {
  const env = await loginShellEnv()
  const binary =
    (await findCommand(OPENCODE_COMMAND, env, 'program-or-batch')) ??
    (await askShellFor(OPENCODE_COMMAND, env))

  if (!binary) return null

  return { binary, env, version: parseOpenCodeVersion(await runQuiet(binary, ['--version'], env)) }
}
