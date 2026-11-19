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
