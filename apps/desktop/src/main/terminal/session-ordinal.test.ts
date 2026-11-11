import { it, expect, describe } from 'vitest'

import { nextOrdinal } from './session-ordinal'

describe('nextOrdinal', () => {
  it('наименьший свободный номер', () => {
    expect(nextOrdinal([])).toBe(1)
    expect(nextOrdinal([1, 3])).toBe(2)
    expect(nextOrdinal([2, 1])).toBe(3)
  })
})
