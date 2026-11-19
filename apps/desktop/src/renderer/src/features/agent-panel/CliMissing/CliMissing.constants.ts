import type { ProviderId } from '@shared/providers'

import { IS_MAC } from '../../../lib/platform'

/**
 * Официальная установка CLI провайдера одной командой - команда, а не текст интерфейса.
 * Claude Code на Windows - установщик PowerShell: он кладёт claude.exe в
 * %USERPROFILE%\.local\bin, где его ищет панель (ADR 0048). Codex и OpenCode - пакетом npm,
 * одна команда на обеих системах.
 */
export const INSTALL_COMMANDS: Record<ProviderId, string> = {
  claude: IS_MAC
    ? 'curl -fsSL https://claude.ai/install.sh | bash'
    : 'irm https://claude.ai/install.ps1 | iex',
  codex: 'npm install -g @openai/codex',
  opencode: 'npm install -g opencode-ai',
}

/** Язык подсветки команды установки. */
export const INSTALL_LANGUAGE = IS_MAC ? 'bash' : 'powershell'

/** Образец пути в пустом поле - путь, а не текст интерфейса. */
export const PATH_PLACEHOLDER = IS_MAC
  ? '/path/to/claude'
  : 'C:\\Users\\you\\.local\\bin\\claude.exe'
