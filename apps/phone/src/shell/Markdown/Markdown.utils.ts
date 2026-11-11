import type { Token, Tokens, TokensList } from 'marked'
import { Lexer } from 'marked'

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

/** Номер пункта, как написан в исходнике: шаги называют по номеру («сделай шаг 3»). */
export const listMarker = (list: Tokens.List, item: Tokens.ListItem, index: number): string => {
  if (!list.ordered) return '•'

  const written = /^\s*(\d{1,9})[.)]/.exec(item.raw)?.[1]
  const start = typeof list.start === 'number' ? list.start : 1

  return `${written === undefined ? start + index : Number(written)}.`
}

/** Вложенные токены строки, если они есть; иначе сам текст токеном. */
export const inlineTokens = (token: Token): Token[] =>
  'tokens' in token && Array.isArray(token.tokens) ? token.tokens : []
