/**
 * Сколько знаков вывода сессия держит для окна, которое подключается к ней заново
 * (перезагрузка окна). Больше, чем помнит прокрутка терминала, не нужно.
 */
export const REPLAY_LIMIT = 1_000_000

/** Хвост режется, когда перерос предел на четверть: резать на каждом куске - дорого. */
export const REPLAY_SLACK = 1.25

/**
 * Резать хвост - по переводу строки, если он недалеко: иначе первая строка начнётся с
 * середины управляющей последовательности и покажет мусор.
 */
export const REPLAY_LINE_REACH = 4096

/** Вывод копится и уходит в окно не чаще раза в столько мс: поток мелких кусков забил бы IPC. */
export const FLUSH_MS = 8

/**
 * Окно отстало от оболочки на столько знаков - оболочка на паузе, пока окно не догонит до
 * FLOW_LOW. Иначе `yes` или `cat` большого файла копили бы вывод в окне без предела.
 */
export const FLOW_HIGH = 200_000
export const FLOW_LOW = 20_000

/** Оболочка не вышла по SIGHUP за столько - SIGKILL. */
export const KILL_GRACE_MS = 1500

/** Тип терминала для программ: его понимает xterm.js окна. */
export const PTY_NAME = 'xterm-256color'

/** Оболочка, если у пользователя она не записана. */
export const FALLBACK_SHELL = '/bin/zsh'

/** Кодировка по умолчанию: без неё оболочка, запущенная из Finder, ломает не-ASCII. */
export const FALLBACK_LANG = 'en_US.UTF-8'

/** Имя и версия терминала для программ (TERM_PROGRAM), как у других терминалов. */
export const TERM_PROGRAM = 'AgenticWorkstation'

/**
 * Переменные, которые IDE получила от своего запуска, а оболочке человека не нужны: свои
 * Electron и IDE (dev-копия IDE, запущенная в терминале, приняла бы их за свои), скрипты
 * pnpm и чужой терминал, из которого запущен dev (программы решили бы, что они в нём).
 */
export const PRIVATE_ENV_PREFIXES = [
  'ELECTRON_',
  'AGENTIC_WORKSTATION_',
  'VITE_',
  'npm_',
  'PNPM_',
  'ITERM_',
  'VSCODE_',
  'KITTY_',
  'WEZTERM_',
  'LC_TERMINAL',
] as const

export const PRIVATE_ENV_NAMES = [
  'NODE_ENV',
  'INIT_CWD',
  'TERMINAL_EMULATOR',
  'TERM_SESSION_ID',
  'TMUX',
  'TMUX_PANE',
] as const

/** Размер терминала в знаках, который окно может попросить: больше не бывает ни на каком экране. */
export const TERMINAL_SIZE_MAX = 2000
