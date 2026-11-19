import type { ProviderId } from '@shared/providers'

import { IS_MAC } from '../../../lib/platform'

/**
 * Официальная установка CLI провайдера одной командой - команда, а не текст интерфейса.
 * Claude Code на Windows - установщик PowerShell: он кладёт claude.exe в
 * %USERPROFILE%\.local\bin, где его ищет панель (ADR 0048). Codex и OpenCode - пакетом npm,
 * одна команда на обеих системах. Antigravity CLI и Kimi Code - своими скриптами установки
 * (ADR 0092): один бинарник в домашней папке.
 */
export const INSTALL_COMMANDS: Record<ProviderId, string> = {
  claude: IS_MAC
    ? 'curl -fsSL https://claude.ai/install.sh | bash'
    : 'irm https://claude.ai/install.ps1 | iex',
  codex: 'npm install -g @openai/codex',
  antigravity: IS_MAC
    ? 'curl -fsSL https://antigravity.google/cli/install.sh | bash'
    : 'irm https://antigravity.google/cli/install.ps1 | iex',
  kimi: IS_MAC
    ? 'curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash'
    : 'irm https://code.kimi.com/kimi-code/install.ps1 | iex',
  opencode: 'npm install -g opencode-ai',
}

/**
 * Git for Windows командой winget с git-scm.com: Kimi Code на Windows выполняет команды в его
 * Git Bash и без него не открывает сессию (экран «не хватает Git Bash»).
 */
export const GIT_BASH_INSTALL = 'winget install --id Git.Git -e --source winget'

/** Язык подсветки команды установки. */
export const INSTALL_LANGUAGE = IS_MAC ? 'bash' : 'powershell'

/** Образец пути в пустом поле - путь, а не текст интерфейса. */
export const PATH_PLACEHOLDER = IS_MAC
  ? '/path/to/claude'
  : 'C:\\Users\\you\\.local\\bin\\claude.exe'
