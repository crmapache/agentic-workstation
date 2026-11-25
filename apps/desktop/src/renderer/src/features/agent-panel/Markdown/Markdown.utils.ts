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

/** Строка, открывающая или закрывающая забор кода: «```ts», «~~~~». */
const FENCE = /^ {0,3}(`{3,}|~{3,})/

/**
 * Текст ответа или его блока (цитата) в буфер: блоки (списки, цитаты, код, таблицы)
 * остаются как написаны, а выделение внутри строки уходит - звёздочки жирного и обратные
 * кавычки кода в скопированном тексте ничего не выделяют и торчат мусором (ACC). Внутри
 * блоков кода не трогается ничего.
 */
export const clipboardText = (markdown: string): string => {
  let fence: string | null = null

  return markdown
    .split('\n')
    .map((line) => {
      const opened = FENCE.exec(line)?.[1]

      if (fence) {
        if (opened && opened[0] === fence[0] && opened.length >= fence.length) fence = null

        return line
      }

      if (opened) {
        fence = opened

        return line
      }

      return line.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '$1').replace(/`([^`\n]+)`/g, '$1')
    })
    .join('\n')
}
