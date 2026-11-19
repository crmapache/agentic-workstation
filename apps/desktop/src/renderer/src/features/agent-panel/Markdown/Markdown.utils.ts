import type { Tokens } from 'marked'

import { BULLET } from './Markdown.constants'

/** Язык подсветки из инфо-строки забора: её первое слово (`ts title="a.ts"` - `ts`). */
export const codeLanguage = (info: string | undefined) => info?.trim().split(/\s/)[0] ?? ''

/**
 * Маркер пункта, как в ACC: у маркированного - длинное тире, у нумерованного - номер,
 * который написан в исходнике у этого пункта, а не порядковый: шаг называют по номеру
 * («сделай шаг 3»), и перенумерация сломала бы ссылку на него.
 */
export const listItemMarker = (list: Tokens.List, item: Tokens.ListItem, index: number) => {
  if (!list.ordered) return BULLET

  const written = /^\s*(\d{1,9})[.)]/.exec(item.raw)?.[1]
  const start = typeof list.start === 'number' ? list.start : 1

  return `${written === undefined ? start + index : Number(written)}.`
}
