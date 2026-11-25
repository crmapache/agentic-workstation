import { execFile } from 'node:child_process'

import { findCommand } from '../../process/binary-locator'
import { loginShellEnv } from '../../process/shell-env'
import { HostArgError } from './host-args'

/** Сколько вывода программы расширение получает, по каждому потоку. */
const OUTPUT_MAX_BYTES = 1024 * 1024

/**
 * Программа для расширения (право shell): ищется в PATH оболочки человека, запускается без
 * оболочки (аргументы не разбираются как команда - подстановки не будет), в папке проекта, со
 * сроком. Код выхода не исключение: расширение решает само.
 */
export const runProgram = async (
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; input: string | null },
): Promise<{ code: number | null; stdout: string; stderr: string }> => {
  const env = await loginShellEnv()
  // На Windows - с PATHEXT (`git` - это git.exe); обёртка .cmd годится, только если за ней программа.
  const file = await findCommand(command, env)

  if (!file) throw new HostArgError(`"${command}" is not found in PATH.`)

  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      {
        cwd: options.cwd,
        env,
        timeout: options.timeoutMs,
        maxBuffer: OUTPUT_MAX_BYTES,
        windowsHide: true,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        const code = error && typeof error.code === 'number' ? error.code : error ? null : 0

        resolve({
          code,
          stdout,
          stderr: error && !stderr && code === null ? error.message : stderr,
        })
      },
    )

    if (options.input !== null) child.stdin?.end(options.input)
    else child.stdin?.end()
  })
}
