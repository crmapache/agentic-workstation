import type { Token, Tokens, TokensList } from 'marked'
import { Lexer } from 'marked'

import { CODE_MARKS, LAID_OUT_LINE, PROSE_LANGUAGES, CODE_MARKS_SHARE } from './Markdown.constants'

/** Разбор Markdown - только лексер marked: в HTML он не превращается никогда. */
export const lexMarkdown = (text: string): TokensList =>
  Lexer.lex(text, { gfm: true, breaks: false })

/** Ссылка, которую можно открыть: http, https и почта. Остальное (javascript:, file:) - текстом. */
export const safeHref = (href: string): string | null => {
  try {
    const url = new URL(href)

    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

/** Язык блока кода - первое слово инфо-строки забора (`ts title="a.ts"` - `ts`). */
export const codeLanguage = (info: string | undefined): string => info?.trim().split(/\s/)[0] ?? ''

/**
 * Текст в заборе кода, а не код: письмо или сообщение, которое модель дала скопировать. Такой
 * блок переносит строки по словам и виден на узком экране целиком, а код листается вбок: перенос
 * ломал бы его отступы и колонки. Мерка та же, что в окне IDE (`isProseBlock` панели): язык
 * забора решает сразу (`text`, `md` - текст, язык кода - код), без языка - содержимое: ни
 * отступов, ни колонок, ни рамок, а знаков кода (`{};=<>|$`) - единицы на сотню.
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

/** Номер пункта, как написан в исходнике: шаги называют по номеру («сделай шаг 3»). */
export const listMarker = (list: Tokens.List, item: Tokens.ListItem, index: number): string => {
  const written = /^\s*(\d{1,9})[.)]/.exec(item.raw)?.[1]
  const start = typeof list.start === 'number' ? list.start : 1

  return `${written === undefined ? start + index : Number(written)}.`
}

/** Вложенные токены строки, если они есть; иначе сам текст токеном. */
export const inlineTokens = (token: Token): Token[] =>
  'tokens' in token && Array.isArray(token.tokens) ? token.tokens : []

/** Строка, открывающая или закрывающая забор кода: «```ts», «~~~~». */
const FENCE = /^ {0,3}(`{3,}|~{3,})/

/**
 * Текст блока (цитата) в буфер: блоки внутри (списки, код) остаются как написаны, а выделение
 * внутри строки уходит - звёздочки жирного и обратные кавычки кода в письме или сообщении ничего
 * не выделяют и торчат мусором. Внутри блоков кода не трогается ничего. Как копия в IDE.
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
