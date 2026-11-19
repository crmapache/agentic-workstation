import { it, expect, describe } from 'vitest'

import { isAsideDraft, asideQuestion } from './aside.utils'

describe('вопрос сбоку в поле', () => {
  it('вопрос берётся целиком, с переводами строк', () => {
    expect(asideQuestion('/btw why is it slow?\nand where')).toBe('why is it slow?\nand where')
    expect(asideQuestion('  /btw   x  ')).toBe('x')
  })

  it('голый /btw - пустой вопрос, чужая команда - не вопрос', () => {
    expect(asideQuestion('/btw')).toBe('')
    expect(asideQuestion('/btwx')).toBeNull()
    expect(asideQuestion('btw')).toBeNull()
  })

  it('команда, ставшая чипом, - тоже вопрос сбоку', () => {
    const tokens = [
      { kind: 'chip' as const, chip: { kind: 'cmd' as const, value: 'btw' } },
      { kind: 'text' as const, value: ' why?' },
    ]

    expect(isAsideDraft(tokens)).toBe(true)
    expect(isAsideDraft([{ kind: 'text', value: '/compact' }])).toBe(false)
  })
})
