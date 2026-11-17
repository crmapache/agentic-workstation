import { it, expect, describe } from 'vitest'

import {
  cleanHours,
  lastClosing,
  nextClosing,
  nextOpening,
  spanMinutes,
  isWorkingTime,
} from './queue-hours'
import type { QueueHours } from './scenario-queues'

/** Местное время: 16 ноября 2026 - понедельник. */
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime()

const WEEKDAYS: QueueHours = { from: 10 * 60, to: 19 * 60, days: [1, 2, 3, 4, 5] }

describe('queue working hours', () => {
  it('works inside the window on chosen days only', () => {
    expect(isWorkingTime(WEEKDAYS, at(16, 9, 59))).toBe(false)
    expect(isWorkingTime(WEEKDAYS, at(16, 10))).toBe(true)
    expect(isWorkingTime(WEEKDAYS, at(16, 18, 59))).toBe(true)
    expect(isWorkingTime(WEEKDAYS, at(16, 19))).toBe(false)
    // Суббота.
    expect(isWorkingTime(WEEKDAYS, at(21, 12))).toBe(false)
  })

  it('finds the next opening across the weekend', () => {
    expect(nextOpening(WEEKDAYS, at(20, 19, 30))).toBe(at(23, 10))
    expect(nextOpening(WEEKDAYS, at(16, 9))).toBe(at(16, 10))
  })

  it('finds the last closing, even the previous week', () => {
    expect(lastClosing(WEEKDAYS, at(16, 20))).toBe(at(16, 19))
    expect(lastClosing(WEEKDAYS, at(16, 9))).toBe(at(13, 19))
  })

  it('runs a window past midnight on the day it opens', () => {
    const night: QueueHours = { from: 22 * 60, to: 6 * 60, days: [1] }

    expect(spanMinutes(night)).toBe(8 * 60)
    expect(isWorkingTime(night, at(16, 21))).toBe(false)
    expect(isWorkingTime(night, at(17, 3))).toBe(true)
    expect(isWorkingTime(night, at(17, 6))).toBe(false)
    // Вторник не выбран: его ночь не рабочая.
    expect(isWorkingTime(night, at(17, 23))).toBe(false)
    expect(nextClosing(night, at(16, 23))).toBe(at(17, 6))
  })

  it('treats equal ends as a whole day and joins days in a row', () => {
    const weekend: QueueHours = { from: 0, to: 0, days: [6, 7] }

    expect(spanMinutes(weekend)).toBe(24 * 60)
    expect(isWorkingTime(weekend, at(21, 0))).toBe(true)
    expect(isWorkingTime(weekend, at(22, 23, 59))).toBe(true)
    expect(isWorkingTime(weekend, at(23, 0))).toBe(false)
    expect(nextClosing(weekend, at(21, 10))).toBe(at(23, 0))
  })

  it('never closes a whole week of whole days', () => {
    const always: QueueHours = { from: 10 * 60, to: 10 * 60, days: [1, 2, 3, 4, 5, 6, 7] }

    expect(isWorkingTime(always, at(16, 3))).toBe(true)
    expect(nextClosing(always, at(16, 12))).toBe(0)
    expect(nextOpening(always, at(16, 12))).toBe(0)
  })

  it('never opens without days', () => {
    const none: QueueHours = { from: 600, to: 1140, days: [] }

    expect(isWorkingTime(none, at(16, 12))).toBe(false)
    expect(nextOpening(none, at(16, 12))).toBe(0)
    expect(nextClosing(none, at(16, 12))).toBe(0)
  })

  it('cleans what came from outside', () => {
    expect(cleanHours({ from: -5, to: 9999, days: [5, 1, 5, 0, 8, 2.5] })).toEqual({
      from: 0,
      to: 24 * 60 - 1,
      days: [1, 5],
    })
  })
})
