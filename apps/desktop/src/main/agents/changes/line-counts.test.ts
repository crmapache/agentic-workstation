import { it, expect, describe } from 'vitest'

import { patchLines, writtenLines } from './line-counts'

describe('writtenLines', () => {
  it('counts lines without a trailing empty one', () => {
    expect(writtenLines('a\nb\n')).toBe(2)
    expect(writtenLines('a\nb')).toBe(2)
    expect(writtenLines('\n\n')).toBe(0)
    expect(writtenLines('')).toBe(0)
  })
})

describe('patchLines', () => {
  it('counts plus and minus lines of every hunk', () => {
    const hunks = [{ lines: ['+a', '-b', ' c'] }, { lines: ['+d', '\\ No newline at end of file'] }]

    expect(patchLines(hunks)).toEqual({ added: 2, removed: 1 })
    expect(patchLines(null)).toEqual({ added: 0, removed: 0 })
  })
})
