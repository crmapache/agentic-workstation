import type { Tokens } from 'marked'
import { it, expect, describe } from 'vitest'

import { lexMarkdown, isProseBlock, clipboardText } from './Markdown.utils'

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

describe('isProseBlock', () => {
  const MESSAGE = [
    'Bill, about the prescreening. If we send only the matching sections, we can lose the links between them, like the BCBSMA list (the one from Tuesday).',
    '',
    'How do you see it?',
  ].join('\n')

  it('сообщение для копирования без языка забора - текст: переносится и видно целиком', () => {
    expect(isProseBlock('', MESSAGE)).toBe(true)
  })

  it('язык забора решает сразу: text и md - текст, язык кода - код', () => {
    expect(isProseBlock('text', 'a = 1; b = {c}')).toBe(true)
    expect(isProseBlock('Markdown', MESSAGE)).toBe(true)
    expect(isProseBlock('ts', MESSAGE)).toBe(false)
    expect(isProseBlock('bash', 'npm run build')).toBe(false)
  })

  it('код без языка - код: отступы, знаки кода, колонки и рамки не переносятся', () => {
    expect(isProseBlock('', 'if (ready) {\n  start()\n}')).toBe(false)
    expect(isProseBlock('', 'const total = items.length; print(total)')).toBe(false)
    expect(isProseBlock('', 'npm run build && npm test')).toBe(false)
    expect(isProseBlock('', 'name     size\nrifle    8820')).toBe(false)
    expect(isProseBlock('', '┌──────┐\n│ box  │\n└──────┘')).toBe(false)
    expect(isProseBlock('', '   ')).toBe(false)
  })
})
