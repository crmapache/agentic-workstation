import { userInfo } from 'node:os'
import { win32 } from 'node:path'

import { IS_WINDOWS } from '../platform'
import { PTY_NAME, WINDOWS_SHELL, FALLBACK_SHELL } from './terminal.constants'
import type { SpawnPty } from './terminal.types'

/**
 * Запуск оболочки в псевдотерминале через node-pty (ADR 0037). Пакет с нативным модулем
 * грузится на первой вкладке, а не на старте IDE: терминал открывают не всегда.
 */
export const spawnNodePty: SpawnPty = async (shell, args, options) => {
  const { spawn } = await import('node-pty')

  return spawn(shell, args, { name: PTY_NAME, ...options })
}

/**
 * Оболочка входа пользователя - из записи пользователя, а не из окружения запуска IDE. На
 * Windows такой записи нет - PowerShell, оболочка Windows по умолчанию.
 */
export const loginShell = (): string => {
  if (IS_WINDOWS) return WINDOWS_SHELL

  try {
    return userInfo().shell || process.env['SHELL'] || FALLBACK_SHELL
  } catch {
    return process.env['SHELL'] || FALLBACK_SHELL
  }
}

/**
 * Аргументы оболочки терминала: входной (-l), чтобы собрала PATH и прочее из профиля. У
 * PowerShell и cmd такого флага нет - их профиль читается и так; PowerShell без заставки.
 */
export const shellArgs = (shell: string): string[] => {
  const name = win32.basename(shell).toLowerCase()

  if (name === 'powershell.exe' || name === 'pwsh.exe') return ['-NoLogo']
  if (name === 'cmd.exe') return []

  return ['-l']
}
