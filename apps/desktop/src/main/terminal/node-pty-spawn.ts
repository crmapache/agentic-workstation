import { userInfo } from 'node:os'

import { PTY_NAME, FALLBACK_SHELL } from './terminal.constants'
import type { SpawnPty } from './terminal.types'

/**
 * Запуск оболочки в псевдотерминале через node-pty (ADR 0037). Пакет с нативным модулем
 * грузится на первой вкладке, а не на старте IDE: терминал открывают не всегда.
 */
export const spawnNodePty: SpawnPty = async (shell, args, options) => {
  const { spawn } = await import('node-pty')

  return spawn(shell, args, { name: PTY_NAME, ...options })
}

/** Оболочка входа пользователя - из записи пользователя, а не из окружения запуска IDE. */
export const loginShell = (): string => {
  try {
    return userInfo().shell || process.env['SHELL'] || FALLBACK_SHELL
  } catch {
    return process.env['SHELL'] || FALLBACK_SHELL
  }
}
