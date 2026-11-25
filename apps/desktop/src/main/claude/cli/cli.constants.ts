/**
 * Команда Claude Code. На Windows запускается всегда сама программа claude.exe, а не через
 * cmd.exe: там слова в аргументах ломались бы на кавычках и процентах (ADR 0048). Поэтому
 * обёртку npm (`claude.cmd`) поиск заменяет её claude.exe - пакет npm несёт ту же родную
 * программу (`bin/claude.exe`), что и установщик (`process/cli-search.ts`).
 */
export const CLAUDE_COMMAND = 'claude'

/** Сколько ждать `command -v` и `--help` у CLI. */
export const CLI_PROBE_TIMEOUT_MS = 5_000

/** Сколько ждать ответа одноразового процесса CLI (каталог моделей до первого хода). */
export const PROBE_TIMEOUT_MS = 15_000

/** Сколько последних символов stderr держать для журнала, если процесс упал. */
export const STDERR_TAIL_CHARS = 4_000

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
