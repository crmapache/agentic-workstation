import type { Tokens } from 'marked'

import {
  BULLET,
  CODE_MARKS,
  LAID_OUT_LINE,
  PROSE_LANGUAGES,
  CODE_MARKS_SHARE,
} from './Markdown.constants'

/** Язык подсветки из инфо-строки забора: её первое слово (`ts title="a.ts"` - `ts`). */
export const codeLanguage = (info: string | undefined) => info?.trim().split(/\s/)[0] ?? ''

/**
 * Текст в заборе кода, а не код: письмо, сообщение или абзац, который модель дала скопировать.
 * Такой блок переносит длинные строки по словам и виден целиком, а код листается вбок: перенос
 * ломал бы его отступы и колонки (просьба владельца). Язык забора решает сразу (`text`, `md` -
 * текст, `ts`, `bash` - код); без языка - содержимое: ни отступов, ни колонок, ни рамок, а знаков
 * кода (`{};=<>|$`) - единицы на сотню.
 */
export const isProseBlock = (language: string, text: string): boolean => {
  const lang = language.toLowerCase()

  if (lang) return PROSE_LANGUAGES.has(lang)

  const lines = text.split('\n').filter((line) => line.trim() !== '')

  if (lines.length === 0 || lines.some((line) => LAID_OUT_LINE.test(line))) return false

  const marks = text.match(CODE_MARKS)?.length ?? 0
  const visible = text.replace(/\s/g, '').length

  return marks <= visible * CODE_MARKS_SHARE
}

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
