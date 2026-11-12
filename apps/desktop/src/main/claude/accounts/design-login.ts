import { mkdir } from 'node:fs/promises'

import type { PanelTerminalCommand } from '@shared/claude-panel'

import { IS_WINDOWS } from '../../platform'
import { consoleScript, writeConsoleScript } from './console-script'

/**
 * Команда CLI в Терминале, в хранилище аккаунта в работе (как в ACC): `/design-login` -
 * свой экран, браузер, код, - и `/logout`. Потоковый CLI их не отдаёт вовсе, поэтому
 * Терминал. Хранилище обязательно: credential Claude Design лежит рядом с обычным входом
 * и ездит с переменной хранилища, а выход в чужой оболочке закончил бы чужой аккаунт.
 * Команда - первым промптом сессии.
 */
export const terminalCommandScript = (
  binary: string,
  drawer: string | null,
  command: PanelTerminalCommand,
  windows = IS_WINDOWS,
): string => consoleScript(binary, drawer, [`/${command}`], windows)

/** Записать скрипт рядом с хранилищами и отдать путь для терминала. */
export const writeTerminalCommand = async (
  dir: string,
  binary: string,
  drawer: string | null,
  command: PanelTerminalCommand,
): Promise<string> => {
  await mkdir(dir, { recursive: true, mode: 0o700 })

  return writeConsoleScript(dir, command, terminalCommandScript(binary, drawer, command))
}
