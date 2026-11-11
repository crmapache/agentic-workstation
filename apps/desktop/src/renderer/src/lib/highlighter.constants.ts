/** Тема на CSS-переменных: цвет токена - роль `--color-syntax-*` (ADR 0009). */
export const SYNTAX_THEME = 'agentic-workstation'

/**
 * Сколько грамматике можно думать над одной строкой редактора. Дольше - строка остаётся
 * с тем, что успело раскраситься: зависшее регулярное выражение не должно морозить ввод.
 * Столько же даёт VS Code.
 */
export const LINE_TIME_LIMIT_MS = 500

/**
 * Строки длиннее не раскрашиваются вовсе (сжатый бандл, base64): разбор такой строки
 * стоит секунды, а читать её глазами всё равно никто не будет. Предел - как у VS Code.
 */
export const MAX_HIGHLIGHTED_LINE = 20_000

/** Начертания токена TextMate (shiki и тема редактора) - биты маски. */
export const FONT_STYLE_ITALIC = 1
export const FONT_STYLE_BOLD = 2
export const FONT_STYLE_UNDERLINE = 4
export const FONT_STYLE_STRIKETHROUGH = 8

/**
 * Пауза в росте кода, после которой блок кода красится (useHighlightedLines): ответ
 * печатается, человек правит файл - красить каждую букву заново незачем.
 */
export const HIGHLIGHT_DELAY_MS = 120
