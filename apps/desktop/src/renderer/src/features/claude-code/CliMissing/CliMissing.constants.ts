import { IS_MAC } from '../../../lib/platform'

/**
 * Официальная установка Claude Code одной командой - команда, а не текст интерфейса. На
 * Windows - установщик PowerShell: он кладёт claude.exe в %USERPROFILE%\.local\bin, где его
 * ищет панель (ADR 0048).
 */
export const INSTALL_COMMAND = IS_MAC
  ? 'curl -fsSL https://claude.ai/install.sh | bash'
  : 'irm https://claude.ai/install.ps1 | iex'

/** Язык подсветки команды установки. */
export const INSTALL_LANGUAGE = IS_MAC ? 'bash' : 'powershell'

/** Образец пути в пустом поле - путь, а не текст интерфейса. */
export const PATH_PLACEHOLDER = IS_MAC
  ? '/path/to/claude'
  : 'C:\\Users\\you\\.local\\bin\\claude.exe'
