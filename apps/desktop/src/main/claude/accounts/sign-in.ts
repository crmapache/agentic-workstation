import { execFile } from 'node:child_process'
import { rm, readFile } from 'node:fs/promises'

import { IS_WINDOWS } from '../../platform'
import { psQuote } from '../../windows/powershell'
import { killProcessTree } from '../../windows/process-tree'
import { quote, consoleScript, writeConsoleScript } from './console-script'

/**
 * Скрипт входа для окна терминала: окружение аккаунта и `claude auth login`. Вход в CLI
 * интерактивный (браузер, SSO, код), поэтому идёт в настоящем терминале, а панель ждёт,
 * пока хранилище скажет «вошёл». Номер процесса - в pidFile (на маке exec его сохраняет):
 * отменённый вход панель гасит сама, иначе доведённый в терминале вход лёг бы в хранилище,
 * которого уже нет.
 */
export const signInScript = (
  binary: string,
  drawer: string | null,
  pidFile: string,
  windows = IS_WINDOWS,
): string =>
  consoleScript(binary, drawer, ['auth', 'login'], windows, [
    windows
      ? `$PID | Set-Content -Encoding ascii -LiteralPath ${psQuote(pidFile)}`
      : `echo $$ > ${quote(pidFile)}`,
  ])

/** Записать скрипт входа и отдать путь, который откроет система (writeConsoleScript). */
export const writeSignInScript = async (
  dir: string,
  binary: string,
  drawer: string | null,
  pidFile: string,
): Promise<string> => {
  await rm(pidFile, { force: true })

  return writeConsoleScript(dir, 'sign-in', signInScript(binary, drawer, pidFile))
}

/**
 * Командная строка процесса - чтобы не погасить чужой процесс с тем же номером. На Windows -
 * из Win32_Process: командная строка своих процессов видна без прав администратора.
 */
const commandOf = (pid: number) =>
  new Promise<string>((done) => {
    if (IS_WINDOWS) {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`,
        ],
        (_error, stdout) => done(stdout.trim()),
      )
    } else {
      execFile('ps', ['-p', String(pid), '-o', 'command='], (_error, stdout) => done(stdout.trim()))
    }
  })

/** Погасить вход, который ещё ждёт в Терминале: человек отменил или время вышло. */
export const stopSignInTerminal = async (pidFile: string): Promise<void> => {
  const pid = Number((await readFile(pidFile, 'utf8').catch(() => '')).trim())

  await rm(pidFile, { force: true })

  if (!Number.isInteger(pid) || pid <= 0) return

  if (IS_WINDOWS) {
    // Номер - у PowerShell скрипта входа: гасится вместе с CLI, что он запустил, - но только
    // если по номеру всё ещё он, а не вкладка терминала, получившая освободившийся номер.
    if ((await commandOf(pid)).toLowerCase().includes('sign-in.ps1')) await killProcessTree(pid)

    return
  }

  if (!(await commandOf(pid)).includes('auth login')) return

  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    // Уже закрылся.
  }
}
