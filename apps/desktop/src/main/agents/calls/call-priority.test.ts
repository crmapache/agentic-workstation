import { it, expect, describe } from 'vitest'

import { strongestCall } from './call-priority'

describe('кто из поводов зовёт', () => {
  it('самый важный из собранных', () => {
    expect(strongestCall(new Set(['turnDone', 'error']))).toBe('error')
    expect(strongestCall(new Set(['plan', 'permission']))).toBe('permission')
    expect(strongestCall(new Set())).toBeNull()
  })
})
