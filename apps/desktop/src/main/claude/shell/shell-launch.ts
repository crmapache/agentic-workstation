import { IS_WINDOWS } from '../../platform'
import type { Environment } from '../cli/shell-env'
import { WINDOWS_SHELL } from '../../terminal/terminal.constants'

/**
 * Чем запустить одну команду человека: на маке - его оболочкой (`$SHELL -c`), на Windows -
 * PowerShell, оболочкой терминала IDE там же (ADR 0048).
 */
export const commandShell = (
  command: string,
  env: Environment,
): { file: string; args: string[] } =>
  IS_WINDOWS
    ? {
        file: WINDOWS_SHELL,
        // Вывод в UTF-8: PowerShell 5 в трубу пишет в кодовой странице OEM, и кириллица
        // доходила бы до панели кашей.
        args: [
          '-NoLogo',
          '-Command',
          `[Console]::OutputEncoding = [Text.Encoding]::UTF8; ${command}`,
        ],
      }
    : { file: env['SHELL'] || '/bin/zsh', args: ['-c', command] }
