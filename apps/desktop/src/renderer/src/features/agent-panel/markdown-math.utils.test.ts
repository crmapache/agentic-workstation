import { it, expect, describe } from 'vitest'

import {
  readMathBlock,
  readInlineMath,
  findMathBlockStart,
  findInlineMathStart,
} from './markdown-math.utils'

describe('readMathBlock', () => {
  it('reads a formula over three lines and on one line', () => {
    expect(readMathBlock(['$$', 'E = mc^2', '$$', 'after'].join('\n'))).toEqual({
      raw: ['$$', 'E = mc^2', '$$'].join('\n'),
      latex: 'E = mc^2',
    })
    expect(readMathBlock('  $$ a^2 $$  ')).toEqual({ raw: '  $$ a^2 $$  ', latex: 'a^2' })
    expect(readMathBlock('\\[a\\]')).toEqual({ raw: '\\[a\\]', latex: 'a' })
  })

  it('does not take an unclosed, empty or mixed formula', () => {
    expect(readMathBlock(['$$', '\\frac{a}{b'].join('\n'))).toBeNull()
    expect(readMathBlock(['$$', '$$'].join('\n'))).toBeNull()
    expect(readMathBlock(['\\[', 'a', '$$'].join('\n'))).toBeNull()
    expect(readMathBlock('$$a$$ and $$b$$')).toBeNull()
    expect(readMathBlock('price $$')).toBeNull()
  })

  it('stops at a blank line and at a code fence', () => {
    expect(readMathBlock(['$$', 'a', '', '$$'].join('\n'))).toBeNull()
    expect(readMathBlock(['$$', '```', '$$'].join('\n'))).toBeNull()
  })
})

describe('findMathBlockStart', () => {
  it('finds the line a formula may start on', () => {
    const source = ['hen:', '$$', 'x', '$$'].join('\n')

    expect(findMathBlockStart(source)).toBe(source.indexOf('$$'))
    expect(findMathBlockStart('costs $$ a lot')).toBeUndefined()
  })
})

describe('readInlineMath', () => {
  it('reads a formula and gives back what it ate', () => {
    expect(readInlineMath('$E = mc^2$ follows', 'so ')).toEqual({
      raw: '$E = mc^2$',
      latex: 'E = mc^2',
    })
    expect(readInlineMath('\\(x\\)b', 'a')).toEqual({ raw: '\\(x\\)', latex: 'x' })
  })

  it('refuses a dollar formula with a letter or a digit against it', () => {
    expect(readInlineMath('$b$c', '')).toBeNull()
    expect(readInlineMath('$b$', 'a')).toBeNull()
    expect(readInlineMath('$5$10', '')).toBeNull()
  })

  it('refuses code and bold between the dollars', () => {
    expect(readInlineMath('$10,`config`$ done', 'cost ')).toBeNull()
    expect(readInlineMath('$10,**config**$ done', 'cost ')).toBeNull()
  })
})

describe('findInlineMathStart', () => {
  it('finds the nearest dollar or TeX bracket', () => {
    expect(findInlineMathStart('a \\(x\\) $y$')).toBe(2)
    expect(findInlineMathStart('a $y$')).toBe(2)
    expect(findInlineMathStart('plain')).toBeUndefined()
  })
})
