/**
 * Размер новой оболочки до первого замера: окно терминала ещё не нарисовано. Сразу после
 * него придёт настоящий, и оболочка перерисует приглашение.
 */
export const DEFAULT_TERMINAL_SIZE = { cols: 80, rows: 24 }

/** Окно сообщает главному процессу, сколько дорисовало, пачками не меньше этой. */
export const ACK_BATCH = 5000

/** Сколько строк помнит прокрутка терминала - как у WebStorm по умолчанию. */
export const SCROLLBACK_LINES = 10_000

/** Роли дизайн-системы, из которых собирается шрифт и тема терминала (ADR 0037). */
export const TERMINAL_TYPE_ROLES = {
  family: '--font-code',
  size: '--font-size-sm',
  lineHeight: '--line-height-tight',
} as const

export const TERMINAL_THEME_ROLES = {
  foreground: '--color-fg',
  cursor: '--color-fg-strong',
  cursorAccent: '--color-surface-sunken',
  selectionBackground: '--color-selection',
  black: '--color-ansi-black',
  red: '--color-ansi-red',
  green: '--color-ansi-green',
  yellow: '--color-ansi-yellow',
  blue: '--color-ansi-blue',
  magenta: '--color-ansi-magenta',
  cyan: '--color-ansi-cyan',
  white: '--color-ansi-white',
  brightBlack: '--color-ansi-bright-black',
  brightRed: '--color-ansi-bright-red',
  brightGreen: '--color-ansi-bright-green',
  brightYellow: '--color-ansi-bright-yellow',
  brightBlue: '--color-ansi-bright-blue',
  brightMagenta: '--color-ansi-bright-magenta',
  brightCyan: '--color-ansi-bright-cyan',
  brightWhite: '--color-ansi-bright-white',
} as const
