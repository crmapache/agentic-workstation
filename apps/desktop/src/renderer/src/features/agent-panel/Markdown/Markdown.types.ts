import type { Token, Tokens } from 'marked'

export type MarkdownProps = {
  text: string
}

export type MarkdownTokensProps = {
  tokens: readonly Token[]
}

export type MarkdownTokenProps = {
  token: Token
}

export type MarkdownInlineProps = {
  tokens: readonly Token[]
  /**
   * Куски внутри ссылки: путь и код там не нажимаются отдельно - кнопка внутри ссылки
   * спорила бы с ней за нажатие.
   */
  plain?: boolean | undefined
}

export type MarkdownInlineTokenProps = {
  token: Token
  plain: boolean
}

export type MarkdownListProps = {
  list: Tokens.List
}

export type MarkdownTableProps = {
  table: Tokens.Table
}

export type InlineCodeProps = {
  text: string
}

/** Формула из разбора (`markdown-lexer.ts`): LaTeX без разделителей, блок или строка. */
export type MathToken = {
  type: 'math'
  raw: string
  text: string
  display: boolean
}

/** Выравнивание колонки таблицы. */
export type ColumnAlign = 'left' | 'center' | 'right'
