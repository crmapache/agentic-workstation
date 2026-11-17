import { it, expect, describe } from 'vitest'

import { pad2, withHour, minutesOf, withMinute } from './TimeField.utils'

describe('TimeField utils', () => {
  it('lists minutes by step and keeps an off-step value', () => {
    expect(minutesOf(15, 30)).toEqual([0, 15, 30, 45])
    expect(minutesOf(15, 7)).toEqual([0, 7, 15, 30, 45])
  })

  it('changes the hour or the minutes alone', () => {
    expect(withHour(9 * 60 + 30, 14)).toBe(14 * 60 + 30)
    expect(withMinute(9 * 60 + 30, 5)).toBe(9 * 60 + 5)
    expect(pad2(7)).toBe('07')
  })
})
