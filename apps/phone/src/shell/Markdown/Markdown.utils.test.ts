import type { Tokens } from 'marked'
import { it, expect, describe } from 'vitest'

import { lexMarkdown, clipboardText } from './Markdown.utils'

/** Текст первой цитаты в разметке - то, что уходит в буфер её кнопкой. */
const quoteText = (markdown: string) => {
  const quote = lexMarkdown(markdown).find((token) => token.type === 'blockquote')

  return clipboardText((quote as Tokens.Blockquote).text)
}

describe('clipboardText', () => {
  it('цитата уходит без «>» и без выделения внутри строки, абзацы и пункты остаются', () => {
    expect(
      quoteText('Для Димы:\n\n> **Это** был `TS`\n> вторая строка\n>\n> - пункт\n\nпосле'),
    ).toBe('Это был TS\nвторая строка\n\n- пункт')
  })

  it('внутри блока кода не трогается ничего', () => {
    expect(clipboardText('```ts\nconst a = `x` ** 2\n```\n**after**')).toBe(
      '```ts\nconst a = `x` ** 2\n```\nafter',
    )
  })

  it('забор закрывает только такой же или длиннее', () => {
    expect(clipboardText('````\n```\n`in`\n````\n`out`')).toBe('````\n```\n`in`\n````\nout')
  })
})
