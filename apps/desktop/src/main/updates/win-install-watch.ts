import { win32 } from 'node:path'

import { WINDOWS_HOST_KEYS } from '../browser/browser-places'
import { psQuote } from '../windows/powershell'
import { WINDOWS_INSTALLER_ARGS, WATCH_LOG_COMMAND_CHARS } from './update.constants'

/** Что сторож установки на Windows делает после выхода IDE (ADR 0124). */
export type InstallWatchPlan = {
  version: string
  /** Скачанный установщик, уже сверенный с подписью и суммой. */
  installerPath: string
  /**
   * Установленный exe IDE. По его папке сторож находит процессы, которые держат файлы установки,
   * им же открывает старую версию, если новая не встала.
   */
  appExe: string
  /** Главный процесс IDE: установщик пускается только после его выхода. */
  pid: number
  waitMs: number
  logPath: string
  /** Рабочая папка сторожа и установщика - временная: папку установки держать нельзя. */
  workDir: string
  /** Ключи реестра native host браузера (путь PowerShell) - снимаются на время установки. */
  hostKeys: readonly string[]
}

/**
 * Ключи native host этой IDE во всех браузерах Chromium, путём провайдера реестра PowerShell.
 * Пока ключ есть, Chrome по зову расширения поднимает host - а это exe IDE из папки установки,
 * и установщик не может ни закрыть его насовсем, ни заменить файлы (ADR 0124).
 */
export const browserHostKeys = (
  hostName: string,
  keys: readonly string[] = WINDOWS_HOST_KEYS,
): string[] => keys.map((key) => `${key.replace(/^HKCU\\/, 'HKCU:\\')}\\${hostName}`)

/** Запись в журнал: местное время и «update:», как у маковского скрипта подмены. */
const LOG_FUNCTION = [
  'function Write-UpdateLog([string]$text) {',
  '  try {',
  '    if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }',
  "    Add-Content -LiteralPath $log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' update: ' + $text) -Encoding UTF8",
  '  } catch {}',
  '}',
]

/** Снять и вернуть регистрацию host: что было - запоминается, после установщика - на место. */
const HOST_FUNCTIONS = [
  'function Remove-BrowserHosts {',
  '  foreach ($key in $hostKeys) {',
  '    if (-not (Test-Path -LiteralPath $key)) { continue }',
  '    try {',
  "      $saved[$key] = (Get-ItemProperty -LiteralPath $key -ErrorAction Stop).'(default)'",
  '      Remove-Item -LiteralPath $key -Recurse -Force -ErrorAction Stop',
  "      Write-UpdateLog ('browser host unregistered for the install: ' + $key)",
  "    } catch { Write-UpdateLog ('browser host not unregistered: ' + $key + ': ' + $_.Exception.Message) }",
  '  }',
  '}',
  'function Restore-BrowserHosts {',
  '  foreach ($key in @($saved.Keys)) {',
  '    try {',
  '      if (-not (Test-Path -LiteralPath $key)) { New-Item -Path $key -Force -ErrorAction Stop | Out-Null }',
  '      if ($null -ne $saved[$key]) { Set-Item -LiteralPath $key -Value $saved[$key] -ErrorAction Stop }',
  "      Write-UpdateLog ('browser host registered again: ' + $key)",
  "    } catch { Write-UpdateLog ('browser host not registered again: ' + $key + ': ' + $_.Exception.Message) }",
  '  }',
  '  $saved.Clear()',
  '}',
]

/**
 * Погасить всё, что ещё живёт из папки установки (host браузера, помощники терминала), и записать,
 * что это было. Процесс IDE, путь которого не виден (запущен от администратора), не погасить ни
 * сторожу, ни установщику - он тоже уходит в журнал: это первый подозреваемый, если установщик
 * говорит «не удаётся закрыть».
 */
const STOP_FUNCTION = [
  'function Stop-InstalledProcesses {',
  '  foreach ($process in @(Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue)) {',
  '    $path = [string]$process.ExecutablePath',
  '    $command = [string]$process.CommandLine',
  `    if ($command.Length -gt ${WATCH_LOG_COMMAND_CHARS}) { $command = $command.Substring(0, ${WATCH_LOG_COMMAND_CHARS}) + '...' }`,
  "    $label = [string]$process.Name + ' (pid ' + $process.ProcessId + ')'",
  "    if ($path -and $path.StartsWith($appDir, 'OrdinalIgnoreCase')) {",
  '      try {',
  '        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop',
  "        Write-UpdateLog ('stopped ' + $label + ': ' + $command)",
  "      } catch { Write-UpdateLog ('cannot stop ' + $label + ': ' + $_.Exception.Message + ': ' + $command) }",
  '    } elseif (-not $path -and $process.Name -eq $appName) {',
  "      Write-UpdateLog ('cannot see where ' + $label + ' runs from, it may run as administrator')",
  '    }',
  '  }',
  '}',
]

/** Новая версия не встала - открыть ту, что стоит, как подмена на маке. */
const REOPEN_FUNCTION = [
  'function Start-InstalledIde {',
  '  if (Test-Path -LiteralPath $appExe) {',
  "    Write-UpdateLog 'the update did not go in, opening the installed version again'",
  '    try { Start-Process -FilePath $appExe -WorkingDirectory $appDir -WindowStyle Normal -ErrorAction Stop }',
  "    catch { Write-UpdateLog ('cannot open the installed version: ' + $_.Exception.Message) }",
  "  } else { Write-UpdateLog ('the update did not go in, and the installed version is gone: ' + $appExe) }",
  '}',
]

/**
 * Скрипт сторожа (PowerShell 5.1, ADR 0124). Порядок важен:
 * 1. ждёт выхода IDE (она сохраняет файлы и гасит Claude и сценарии), не дождался - убирает
 *    установщик и уходит: выход отменили, ставить нечего;
 * 2. снимает регистрацию host браузера и гасит процессы из папки установки - иначе Chrome
 *    поднимал бы host снова, и установщик не мог бы её освободить;
 * 3. запускает установщик с окном и ждёт выхода только его самого: Start-Process -Wait в Windows
 *    PowerShell ждёт и потомков, а среди них может оказаться новая IDE, открытая установщиком;
 * 4. в любом исходе возвращает регистрацию host; установщик не встал - открывает старую версию.
 *
 * Двойных кавычек в скрипте нет: он едет одним аргументом командной строки, а их экранирование
 * Windows PowerShell разбирает по-своему. Все значения - строками в одинарных кавычках.
 */
export const installWatchScript = (plan: InstallWatchPlan): string => {
  const seconds = Math.round(plan.waitMs / 1000)
  const args = WINDOWS_INSTALLER_ARGS.map(psQuote).join(',')
  const waitFor = `Get-Process -Id ${plan.pid} -ErrorAction SilentlyContinue`

  return [
    `$log = ${psQuote(plan.logPath)}`,
    `$logDir = ${psQuote(win32.dirname(plan.logPath))}`,
    `$installer = ${psQuote(plan.installerPath)}`,
    `$appExe = ${psQuote(plan.appExe)}`,
    `$appDir = ${psQuote(`${win32.dirname(plan.appExe)}\\`)}`,
    `$appName = ${psQuote(win32.basename(plan.appExe))}`,
    `$workDir = ${psQuote(plan.workDir)}`,
    `$hostKeys = @(${plan.hostKeys.map(psQuote).join(',')})`,
    '$saved = @{}',
    ...LOG_FUNCTION,
    ...HOST_FUNCTIONS,
    ...STOP_FUNCTION,
    ...REOPEN_FUNCTION,
    `Write-UpdateLog ${psQuote(`${plan.version}: waiting up to ${seconds} s for the IDE (pid ${plan.pid}) to quit`)}`,
    `$ide = ${waitFor}`,
    '$quit = $true',
    'if ($ide) {',
    `  try { $quit = $ide.WaitForExit(${plan.waitMs}) }`,
    '  catch {',
    "    Write-UpdateLog ('cannot wait on the IDE process, polling instead: ' + $_.Exception.Message)",
    `    $deadline = (Get-Date).AddMilliseconds(${plan.waitMs})`,
    `    while ((${waitFor}) -and ((Get-Date) -lt $deadline)) { Start-Sleep -Milliseconds 250 }`,
    `    $quit = -not (${waitFor})`,
    '  }',
    '}',
    'if (-not $quit) {',
    `  Write-UpdateLog ${psQuote(`the IDE did not quit in ${seconds} s (quit cancelled?), the installer is removed`)}`,
    '  Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue',
    '  exit 1',
    '}',
    "Write-UpdateLog 'the IDE quit'",
    '$code = $null',
    'try {',
    '  Remove-BrowserHosts',
    '  Stop-InstalledProcesses',
    '  Start-Sleep -Milliseconds 500',
    "  if (-not (Test-Path -LiteralPath $installer)) { throw ('the installer is gone: ' + $installer) }",
    `  Write-UpdateLog ('starting the installer ' + $installer + ' (' + (Get-Item -LiteralPath $installer).Length + ' bytes) with ' + ${psQuote(WINDOWS_INSTALLER_ARGS.join(' '))})`,
    `  $setup = Start-Process -FilePath $installer -ArgumentList ${args} -WorkingDirectory $workDir -WindowStyle Normal -PassThru -ErrorAction Stop`,
    '  $null = $setup.Handle',
    '  $setup.WaitForExit()',
    '  $code = $setup.ExitCode',
    "  Write-UpdateLog ('the installer exited with code ' + $code)",
    '} catch {',
    "  Write-UpdateLog ('the update stopped: ' + $_.Exception.Message)",
    '} finally {',
    '  Restore-BrowserHosts',
    '}',
    'if ($code -ne 0) {',
    '  Start-InstalledIde',
    '  exit 1',
    '}',
    "Write-UpdateLog 'installed, the installer opened the new version'",
  ].join('\n')
}
