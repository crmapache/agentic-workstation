import { it, expect, describe } from 'vitest'

import {
  streaksOf,
  bestWindow,
  workSessions,
  dayIndexStart,
  lengthOutside,
  localDayIndex,
  unionIntervals,
  minuteIntervals,
} from './time-math'

describe('unionIntervals', () => {
  it('merges overlapping and touching intervals and drops empty ones', () => {
    expect(
      unionIntervals([
        { start: 5, end: 8 },
        { start: 0, end: 3 },
        { start: 3, end: 4 },
        { start: 7, end: 10 },
        { start: 12, end: 12 },
      ]),
    ).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 10 },
    ])
  })
})

describe('lengthOutside', () => {
  it('measures agent time when the human was away', () => {
    const presence = minuteIntervals([10, 11, 12, 20])
    const wall = [{ start: 5 * 60_000, end: 25 * 60_000 }]

    // 20 минут работы, из них 4 минуты человек был у окна.
    expect(lengthOutside(wall, presence)).toBe(16 * 60_000)
    expect(lengthOutside(wall, [])).toBe(20 * 60_000)
  })
})

describe('workSessions', () => {
  it('splits presence at gaps longer than the limit', () => {
    expect(workSessions([0, 1, 2, 40, 41, 100], 30)).toEqual({
      count: 3,
      longestMinutes: 3,
      averageMinutes: 2,
    })
    expect(workSessions([], 30)).toEqual({ count: 0, longestMinutes: 0, averageMinutes: 0 })
  })
})

describe('streaksOf', () => {
  it('keeps the current streak alive until today is over', () => {
    expect(streaksOf(new Set([1, 2, 3, 7, 8]), 9)).toEqual({
      current: 2,
      best: 3,
      activeToday: false,
    })
    expect(streaksOf(new Set([7, 8, 9]), 9)).toEqual({ current: 3, best: 3, activeToday: true })
    expect(streaksOf(new Set([5]), 9)).toEqual({ current: 0, best: 1, activeToday: false })
  })
})

describe('bestWindow', () => {
  it('finds the busiest run, wrapping around the week', () => {
    expect(bestWindow([0, 5, 6, 7, 0, 0, 0], 3)).toEqual({ from: 1, to: 4 })
    expect(bestWindow([9, 0, 0, 0, 0, 8, 9], 3)).toEqual({ from: 5, to: 1 })
    expect(bestWindow([0, 0, 0], 3)).toBeNull()
  })
})

describe('localDayIndex', () => {
  it('numbers consecutive local days regardless of day length', () => {
    const today = new Date(2026, 2, 10, 15).getTime()
    const index = localDayIndex(today)

    expect(localDayIndex(new Date(2026, 2, 11, 1).getTime())).toBe(index + 1)
    expect(dayIndexStart(index)).toBe(new Date(2026, 2, 10).getTime())
  })
})
