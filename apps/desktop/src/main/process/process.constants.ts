/** Сколько ждать оболочку, у которой спрашиваем окружение. Тяжёлый .zshrc бывает медленным. */
export const SHELL_ENV_TIMEOUT_MS = 10_000

/** Метка перед окружением в выводе оболочки: профиль может напечатать что-то своё. */
export const SHELL_ENV_MARKER = '__AGENTIC_WORKSTATION_ENV__'

/**
 * Папки от домашней, куда CLI ставят установщики, даже если их нет в PATH. Установщик
 * Claude Code на Windows кладёт claude.exe туда же, в .local/bin.
 */
export const EXTRA_BIN_DIRS = [
  '.local/bin',
  '.claude/local',
  '.bun/bin',
  '.volta/bin',
  '.npm-global/bin',
]

/** Системные папки мака, где бывает CLI из Homebrew и npm. */
export const SYSTEM_BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']

/** Пауза между SIGTERM и SIGKILL: CLI успевает закрыть MCP-серверы и записать транскрипт. */
export const KILL_GRACE_MS = 3_000
