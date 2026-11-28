import type { Tokens } from 'marked'
import { it, expect, describe } from 'vitest'

import { lexMarkdown } from '../markdown-lexer'
import { BULLET } from './Markdown.constants'
import { codeLanguage, isProseBlock, clipboardText, listItemMarker } from './Markdown.utils'

/** Маркеры пунктов первого списка в тексте. */
const markers = (text: string) => {
  const list = lexMarkdown(text).find((token) => token.type === 'list') as Tokens.List

  return list.items.map((item, index) => listItemMarker(list, item, index))
}

describe('listItemMarker', () => {
  it('draws an ordinary item with a long dash', () => {
    expect(markers(['- one', '* two'].join('\n'))).toEqual([BULLET])
    expect(markers(['- one', '- two'].join('\n'))).toEqual([BULLET, BULLET])
  })

  // Шаг называют по номеру, поэтому номер - как в исходнике, а не порядковый.
  it('keeps the number written in the source', () => {
    expect(markers(['3. three', '4. four'].join('\n'))).toEqual(['3.', '4.'])
    expect(markers(['1. one', '1. again'].join('\n'))).toEqual(['1.', '1.'])
    expect(markers(['7) seven', '9) nine'].join('\n'))).toEqual(['7.', '9.'])
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

describe('codeLanguage', () => {
  it('takes the first word of the info string', () => {
    expect(codeLanguage('ts title="a.ts"')).toBe('ts')
    expect(codeLanguage('markdown ultracode')).toBe('markdown')
    expect(codeLanguage('')).toBe('')
    expect(codeLanguage(undefined)).toBe('')
  })
})

describe('clipboardText', () => {
  it('выделение внутри строки уходит, блоки остаются', () => {
    expect(clipboardText('**Done**: run `pnpm check`\n\n- one\n- two\n> note')).toBe(
      'Done: run pnpm check\n\n- one\n- two\n> note',
    )
  })

  it('внутри блока кода не трогается ничего', () => {
    const code = '```ts\nconst a = `x` ** 2\n```\n**after**'

    expect(clipboardText(code)).toBe('```ts\nconst a = `x` ** 2\n```\nafter')
  })

  it('забор закрывает только такой же или длиннее', () => {
    expect(clipboardText('````\n```\n`in`\n````\n`out`')).toBe('````\n```\n`in`\n````\nout')
  })
})
