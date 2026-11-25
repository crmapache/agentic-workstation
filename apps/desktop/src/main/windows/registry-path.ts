import { execFile } from 'node:child_process'
import { win32 } from 'node:path'

/** Сколько ждать PATH из реестра: холодный запуск Windows PowerShell бывает в пару секунд. */
const REGISTRY_PATH_TIMEOUT_MS = 5_000

/**
 * PATH системы и человека из реестра. .NET сам раскрывает %ПЕРЕМЕННЫЕ% в значениях
 * REG_EXPAND_SZ, как это делает Windows для нового окна терминала. Вывод - в UTF-8: Windows
 * PowerShell пишет в трубу в кодовой странице OEM, и папка с кириллицей в имени человека пришла
 * бы кашей; reg.exe не годится по той же причине.
 */
const SCRIPT =
  '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; ' +
  "[Environment]::GetEnvironmentVariable('Path', 'Machine'); " +
  "[Environment]::GetEnvironmentVariable('Path', 'User')"

/** Строки ответа - один PATH: системный, потом человека, в том порядке, как его собирает Windows. */
export const registryPathOf = (output: string): string =>
  output
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/;+$/, ''))
    .filter(Boolean)
    .join(';')

/**
 * PATH, который получит новое окно терминала; не прочитался - пусто. PowerShell - полным путём:
 * PATH процесса, которому здесь не верят, мог его и не знать.
 */
export const readRegistryPath = (): Promise<string> =>
  new Promise((resolve) => {
    const powershell = win32.join(
      process.env['SystemRoot'] || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    )
    const child = execFile(
      powershell,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', SCRIPT],
      { timeout: REGISTRY_PATH_TIMEOUT_MS, windowsHide: true, encoding: 'utf8' },
      (_error, stdout) => resolve(registryPathOf(stdout)),
    )

    // Скрипт ничего не ждёт с клавиатуры: конец ввода сразу, чтобы PowerShell не повис.
    child.stdin?.end()
  })
