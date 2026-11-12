import { it, expect, describe } from 'vitest'

import { editDelta } from './manual-edits.utils'

const range = (startLineNumber: number, endLineNumber: number) => ({
  startLineNumber,
  startColumn: 1,
  endLineNumber,
  endColumn: 1,
})

describe('manual edit counts', () => {
  it('counts typed characters and new lines of typing', () => {
    expect(editDelta([{ text: 'const a = 1\n', range: range(3, 3) }], false)).toEqual({
      typed: 12,
      pasted: 0,
      added: 1,
      removed: 0,
    })
  })

  it('counts a paste apart and removed lines of a replaced block', () => {
    expect(editDelta([{ text: 'x\ny', range: range(2, 5) }], true)).toEqual({
      typed: 0,
      pasted: 3,
      added: 1,
      removed: 3,
    })
  })
})
