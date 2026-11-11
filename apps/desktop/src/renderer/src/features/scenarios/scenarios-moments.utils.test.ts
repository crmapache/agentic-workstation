import { it, expect, describe } from 'vitest'

import { endedLabel, momentLabel } from './scenarios-moments.utils'

const words = {
  todayAt: (clock: string) => `today ${clock}`,
  yesterdayAt: (clock: string) => `yesterday ${clock}`,
}

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime()

describe('moments', () => {
  it('says today and yesterday by the clock, older - with the date', () => {
    const now = at(20, 12)

    expect(momentLabel(at(20, 9, 5), words, now)).toBe('today 09:05')
    expect(momentLabel(at(19, 22, 30), words, now)).toBe('yesterday 22:30')
    expect(momentLabel(at(15, 8), words, now)).toMatch(/^Oct 15/)
  })

  it('ends the same day with the clock alone', () => {
    const now = at(20, 12)

    expect(endedLabel(at(19, 22), at(19, 23, 15), words, now)).toBe('23:15')
    expect(endedLabel(at(19, 22), at(20, 1, 15), words, now)).toBe('today 01:15')
  })
})
