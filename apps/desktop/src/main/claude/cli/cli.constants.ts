import { IS_WINDOWS } from '../../platform'

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

/**
 * Имя исполняемого файла Claude Code. На Windows - только claude.exe родного установщика:
 * обёртку npm (claude.cmd) без оболочки не запустить, а через cmd.exe слова человека в
 * аргументах ломались бы на кавычках и процентах (ADR 0048).
 */
export const CLAUDE_BINARY = IS_WINDOWS ? 'claude.exe' : 'claude'

/** Сколько ждать `command -v` и `--help` у CLI. */
export const CLI_PROBE_TIMEOUT_MS = 5_000

/** Сколько ждать ответа одноразового процесса CLI (каталог моделей до первого хода). */
export const PROBE_TIMEOUT_MS = 15_000

/** Сколько последних символов stderr держать для журнала, если процесс упал. */
export const STDERR_TAIL_CHARS = 4_000

/** Пауза между SIGTERM и SIGKILL: CLI успевает закрыть MCP-серверы и записать транскрипт. */
export const KILL_GRACE_MS = 3_000

/**
 * Без этой переменной CLI в потоковом запуске не держит копий файлов, и откат кода к
 * сообщению отвечает «File rewinding is not enabled» (замер ACC на 2.1.280). Процесс
 * разговора получает её по настройке человека `checkpoints` (spawn.ts).
 */
export const CHECKPOINTS_VARIABLE = 'CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING'

/**
 * Переменные окружения процесса разговора. Списки задач (TaskCreate и соседи) CLI
 * без первой переменной у новых моделей прячет - так делает и панель ACC.
 */
export const CLI_ENV_OVERRIDES = {
  CLAUDE_CODE_ENABLE_TODO_TOOLS: '1',
  [CHECKPOINTS_VARIABLE]: '1',
}

/**
 * Пояснение для модели одной строкой: в аргументах запуска переводов строк быть не
 * должно (ADR 0009). Без него агент считает сессию безлюдной и просит человека
 * «запустить в терминале» то, что в окне делается кнопкой.
 */
export const PANEL_BRIEFING =
  'You are running inside the Claude Code panel of Agentic Workstation, a desktop IDE. A person is watching the conversation live and answers permission prompts, questions and plan approvals with buttons in the panel, so ask them as usual. Do not tell them to switch to a terminal or an interactive session for that.'
