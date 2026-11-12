import { spawn } from 'node:child_process'

import { SPAWN_DETACHED } from '../../platform'
import type { ClaudeCli } from '../cli/cli-locator'
import { ProcessGroup } from '../cli/process-group'
import { CLI_COMMAND_TIMEOUT_MS } from './tools.constants'

/** timedOut - процесс погашен потолком по времени, а не кончился сам. */
export type CliRun = { code: number | null; stdout: string; stderr: string; timedOut: boolean }

/**
 * Для долгой команды (поиск модели по разговорам): onStdout - вывод по мере прихода, чтобы
 * окно видело шаги, signal - отмена человеком: группа процессов гасится сразу.
 */
export type CliRunWatch = { onStdout?: (chunk: string) => void; signal?: AbortSignal }

/**
 * Разовая команда CLI (`claude mcp add`, `claude plugin list`) в папке проекта: без
 * ввода, с потолком по времени. Своя группа процессов: установка плагина клонирует
 * репозиторий, и выход из IDE гасит всё это вместе. Ошибка запуска - код null и текст
 * в stderr. input - текст на stdin (`/config` в `claude -p`): значение с пробелами не
 * должно ехать аргументом.
 */
export const runCli = (
  cli: ClaudeCli,
  args: readonly string[],
  cwd: string,
  timeoutMs = CLI_COMMAND_TIMEOUT_MS,
  input?: string,
  watch: CliRunWatch = {},
): Promise<CliRun> =>
  new Promise((resolve) => {
    const child = spawn(cli.binary, args, {
      cwd,
      env: cli.env,
      detached: SPAWN_DETACHED,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Без ввода stdin сразу закрыт: команда видит конец ввода, как с /dev/null. Ошибка
    // записи (процесс уже вышел) не роняет главный процесс - итог скажет close.
    child.stdin.on('error', () => undefined).end(input)

    const group = new ProcessGroup(child)
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      group.kill()
    }, timeoutMs)
    const cancel = () => void group.stop()

    if (watch.signal?.aborted) cancel()
    else watch.signal?.addEventListener('abort', cancel, { once: true })

    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk
      watch.onStdout?.(chunk)
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.once('error', (error) => {
      clearTimeout(timer)
      watch.signal?.removeEventListener('abort', cancel)
      resolve({ code: null, stdout, stderr: error.message, timedOut })
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      watch.signal?.removeEventListener('abort', cancel)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
