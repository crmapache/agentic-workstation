import type { Tokens } from 'marked'
import { it, expect, describe } from 'vitest'

import { lexMarkdown } from '../markdown-lexer'
import { BULLET } from './Markdown.constants'
import { codeLanguage, clipboardText, listItemMarker } from './Markdown.utils'

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
