import { it, expect, describe } from 'vitest'

import { WINDOWS_INSTALLER_ARGS } from './update.constants'
import { browserHostKeys, installWatchScript } from './win-install-watch'
import type { InstallWatchPlan } from './win-install-watch'

const plan: InstallWatchPlan = {
  version: '0.2.0',
  installerPath: "C:\\Users\\O'Neil\\AppData\\Local\\Temp\\agentic-workstation-0.2.0-setup.exe",
  appExe:
    "C:\\Users\\O'Neil\\AppData\\Local\\Programs\\agentic-workstation\\Agentic Workstation.exe",
  pid: 4242,
  waitMs: 60_000,
  logPath: "C:\\Users\\O'Neil\\AppData\\Roaming\\Agentic Workstation\\logs\\update.log",
  workDir: "C:\\Users\\O'Neil\\AppData\\Local\\Temp",
  hostKeys: browserHostKeys('com.agentic_workstation.browser'),
}

const script = installWatchScript(plan)
/** Ход сторожа после определений функций: первая строка - ожидание выхода IDE. */
const flow = script.slice(script.indexOf("Write-UpdateLog '0.2.0: waiting"))
const afterQuit = flow.slice(flow.indexOf("Write-UpdateLog 'the IDE quit'"))

describe('сторож установки обновления Windows (ADR 0124)', () => {
  it('ключи host браузера - путём провайдера реестра PowerShell, во всех браузерах', () => {
    expect(
      browserHostKeys('com.x', ['HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts']),
    ).toEqual(['HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.x'])
    expect(plan.hostKeys).toHaveLength(4)
    expect(plan.hostKeys.every((key) => key.startsWith('HKCU:\\Software\\'))).toBe(true)
  })

  it('установщик - с окном, как обновление и с запуском новой версии после себя', () => {
    expect(WINDOWS_INSTALLER_ARGS).not.toContain('/S')
    expect(script).toContain(
      "Start-Process -FilePath $installer -ArgumentList '--updated','--force-run' -WorkingDirectory $workDir -WindowStyle Normal -PassThru",
    )
    // -Wait ждал бы и потомков установщика - новую IDE; ждём только его самого.
    expect(script).not.toMatch(/\s-Wait(\s|$)/m)
    expect(afterQuit).toContain('$setup.WaitForExit()')
    expect(afterQuit).toContain("Write-UpdateLog ('the installer exited with code ' + $code)")
  })

  it('пути - строками в одинарных кавычках, без двойных: скрипт едет одним аргументом', () => {
    expect(script).not.toContain('"')
    expect(script).toContain(
      "$installer = 'C:\\Users\\O''Neil\\AppData\\Local\\Temp\\agentic-workstation-0.2.0-setup.exe'",
    )
    expect(script).toContain(
      "$appDir = 'C:\\Users\\O''Neil\\AppData\\Local\\Programs\\agentic-workstation\\'",
    )
    expect(script).toContain("$appName = 'Agentic Workstation.exe'")
    expect(script).toContain(
      "$logDir = 'C:\\Users\\O''Neil\\AppData\\Roaming\\Agentic Workstation\\logs'",
    )
    expect(script).toContain("$workDir = 'C:\\Users\\O''Neil\\AppData\\Local\\Temp'")
  })

  it('сначала выход IDE; не вышла - установщик убран, и больше ничего не тронуто', () => {
    const waiting = flow.slice(0, flow.indexOf("Write-UpdateLog 'the IDE quit'"))

    expect(waiting).toContain('Get-Process -Id 4242')
    expect(waiting).toContain('$ide.WaitForExit(60000)')
    expect(waiting).toContain('Remove-Item -LiteralPath $installer')
    expect(waiting).toContain('exit 1')
    expect(waiting).not.toContain('Remove-BrowserHosts')
    expect(waiting).not.toContain('Stop-InstalledProcesses')
    expect(waiting).not.toContain('Start-Process')
  })

  it('порядок после выхода: снять host, погасить процессы установки, установщик, вернуть host', () => {
    const steps = [
      '  Remove-BrowserHosts',
      '  Stop-InstalledProcesses',
      'Start-Process -FilePath $installer',
      '$setup.WaitForExit()',
      '} finally {\n  Restore-BrowserHosts\n}',
      'if ($code -ne 0) {\n  Start-InstalledIde',
    ].map((step) => afterQuit.indexOf(step))

    expect(steps.every((index) => index > 0)).toBe(true)
    expect([...steps].sort((a, b) => a - b)).toEqual(steps)
  })

  it('регистрация host запоминается до удаления и возвращается тем же значением', () => {
    const remove = script.slice(script.indexOf('function Remove-BrowserHosts'))

    expect(remove.indexOf('$saved[$key] = (Get-ItemProperty -LiteralPath $key')).toBeLessThan(
      remove.indexOf('Remove-Item -LiteralPath $key'),
    )
    expect(script).toContain('Set-Item -LiteralPath $key -Value $saved[$key]')
    expect(script).toContain(
      "$hostKeys = @('HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.agentic_workstation.browser',",
    )
  })

  it('процессы из папки установки гасятся по пути, невидимые - только в журнал', () => {
    expect(script).toContain("$path.StartsWith($appDir, 'OrdinalIgnoreCase')")
    expect(script).toContain('Stop-Process -Id $process.ProcessId -Force')
    expect(script).toContain("it may run as administrator')")
  })

  it('без браузеров список ключей пуст, а сторож тот же', () => {
    expect(installWatchScript({ ...plan, hostKeys: [] })).toContain('$hostKeys = @()')
  })
})
