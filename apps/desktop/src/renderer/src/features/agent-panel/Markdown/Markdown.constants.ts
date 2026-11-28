import type { ColumnAlign } from './Markdown.types'

/** Класс заголовка по уровню: в узкой панели крупнее h3 не нужно. */
export const HEADING_CLASS: Record<number, string> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h4',
  6: 'h4',
}

/** Класс ячейки по выравниванию колонки: влево - как обычный текст, без класса. */
export const ALIGN_CLASS: Record<ColumnAlign, string | null> = {
  left: null,
  center: 'alignCenter',
  right: 'alignRight',
}

/** Ссылки, которые можно открыть: только сайты. Остальное (file:, javascript:) - текст. */
export const OPENABLE_LINK = /^https?:\/\//i

/** Маркер пункта маркированного списка - длинное тире, как в ACC. */
export const BULLET = '\u2014'

/** Языки забора, которыми пишут текст, а не код: такой блок переносит строки, как абзац. */
export const PROSE_LANGUAGES: ReadonlySet<string> = new Set([
  'text',
  'txt',
  'plain',
  'plaintext',
  'markdown',
  'md',
])

/**
 * Знаки кода: в тексте для копирования (письмо, сообщение) их почти нет, а в коде без языка
 * забора - на каждой строке. Скобок нет: в тексте они обычны, а код без `=`, `{` и `;` редок.
 */
export const CODE_MARKS = /[{}[\];=<>|&$\\`]/g

/** Доля знаков кода среди непробельных, выше которой блок без языка - код. */
export const CODE_MARKS_SHARE = 0.02

/**
 * Код и рисунки по строению, а не по знакам: отступ в начале строки, выравнивание пробелами
 * внутри строки (колонки), рамки псевдографикой. Перенос сломал бы и то, и другое.
 */
export const LAID_OUT_LINE = /^[ \t]|\S {2,}\S|\t|[\u2500-\u257f]/
