import { it, expect, describe } from 'vitest'

import { MAX_SELECTION_CHARS } from '@shared/claude-draft'

import { snippetChip } from './editor-chat.utils'

describe('кусок файла для чата', () => {
  it('везёт ровно выделенный текст и строки, где он стоит', () => {
    expect(snippetChip('src/a.ts', { from: 3, to: 3 }, 'foo(bar)')).toEqual({
      kind: 'ref',
      value: 'src/a.ts',
      range: 'L3',
      text: 'foo(bar)',
    })
    expect(snippetChip('src/a.ts', { from: 3, to: 7 }, 'x').range).toBe('L3-L7')
  })

  it('слишком длинный кусок - только строки, без текста', () => {
    const chip = snippetChip('a.md', { from: 1, to: 900 }, 'x'.repeat(MAX_SELECTION_CHARS + 1))

    expect(chip.text).toBeUndefined()
    expect(chip.range).toBe('L1-L900')
  })
})
