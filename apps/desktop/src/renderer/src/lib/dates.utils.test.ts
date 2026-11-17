import { it, expect, describe } from 'vitest'

import { waitClock } from './dates.utils'

describe('часы ожидания', () => {
  it('минуты и секунды, часы - только когда дошло до них', () => {
    expect(waitClock(0)).toBe('0:00')
    expect(waitClock(42_400)).toBe('0:42')
    expect(waitClock(12 * 60_000 + 5_000)).toBe('12:05')
    expect(waitClock(3_723_000)).toBe('1:02:03')
  })

  it('часы, отстающие от начала, не уходят в минус', () => {
    expect(waitClock(-500)).toBe('0:00')
  })
})
