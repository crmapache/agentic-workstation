import { it, expect, describe } from 'vitest'

import { nextDue, GRACE_MS, parseDay, dueVerdict } from './task-clock'
import type { TaskSchedule } from './tasks'
import { MINUTE_MS } from './time-units'

const schedule = (patch: Partial<TaskSchedule>): TaskSchedule => ({
  repeat: 'daily',
  at: 9 * 60,
  days: [],
  monthDay: 1,
  date: '',
  ...patch,
})

/** Местное время: тесты не зависят от пояса машины. */
const local = (year: number, month: number, day: number, hours = 0, minutes = 0) =>
  new Date(year, month - 1, day, hours, minutes).getTime()

describe('nextDue', () => {
  it('has no due time for a manual task', () => {
    expect(nextDue(schedule({ repeat: 'manual' }), local(2026, 11, 16, 8))).toBe(0)
  })

  it('runs a daily task today before its hour and tomorrow after it', () => {
    const daily = schedule({ repeat: 'daily' })

    expect(nextDue(daily, local(2026, 11, 16, 8))).toBe(local(2026, 11, 16, 9))
    expect(nextDue(daily, local(2026, 11, 16, 9))).toBe(local(2026, 11, 17, 9))
  })

  it('runs an hourly task at its minute of the next hour', () => {
    const hourly = schedule({ repeat: 'hourly', at: 15 })

    expect(nextDue(hourly, local(2026, 11, 16, 8, 10))).toBe(local(2026, 11, 16, 8, 15))
    expect(nextDue(hourly, local(2026, 11, 16, 8, 15))).toBe(local(2026, 11, 16, 9, 15))
    expect(nextDue(hourly, local(2026, 11, 16, 23, 40))).toBe(local(2026, 11, 17, 0, 15))
  })

  it('runs a weekly task only on its days', () => {
    // 16.11.2026 - понедельник.
    const weekly = schedule({ repeat: 'weekly', days: [3, 5] })

    expect(nextDue(weekly, local(2026, 11, 16, 10))).toBe(local(2026, 11, 18, 9))
    expect(nextDue(weekly, local(2026, 11, 18, 9))).toBe(local(2026, 11, 20, 9))
    expect(nextDue(weekly, local(2026, 11, 20, 12))).toBe(local(2026, 11, 25, 9))
  })

  it('takes a weekly task without days as every day', () => {
    expect(nextDue(schedule({ repeat: 'weekly' }), local(2026, 11, 16, 10))).toBe(
      local(2026, 11, 17, 9),
    )
  })

  it('runs a monthly task on its day, this month or the next', () => {
    const first = schedule({ repeat: 'monthly', monthDay: 1 })

    expect(nextDue(first, local(2026, 11, 16, 10))).toBe(local(2026, 12, 1, 9))
    expect(nextDue(first, local(2026, 12, 1, 8))).toBe(local(2026, 12, 1, 9))
    expect(nextDue(first, local(2026, 12, 31, 23))).toBe(local(2027, 1, 1, 9))
  })

  it('moves a day the month lacks to its last day', () => {
    const last = schedule({ repeat: 'monthly', monthDay: 31 })

    expect(nextDue(last, local(2027, 2, 1, 10))).toBe(local(2027, 2, 28, 9))
    expect(nextDue(last, local(2027, 2, 28, 10))).toBe(local(2027, 3, 31, 9))
  })

  it('runs a one-off task once and never again', () => {
    const once = schedule({ repeat: 'once', date: '2026-11-20', at: 14 * 60 + 30 })

    expect(nextDue(once, local(2026, 11, 16))).toBe(local(2026, 11, 20, 14, 30))
    expect(nextDue(once, local(2026, 11, 20, 14, 30))).toBe(0)
    expect(nextDue(schedule({ repeat: 'once', date: 'soon' }), local(2026, 11, 16))).toBe(0)
  })
})

describe('parseDay', () => {
  it('reads a real calendar day only', () => {
    expect(parseDay('2026-02-28')?.getDate()).toBe(28)
    expect(parseDay('2026-02-30')).toBeNull()
    expect(parseDay('26-2-3')).toBeNull()
  })
})

describe('dueVerdict', () => {
  const now = local(2026, 12, 1, 9, 2)

  it('runs a due task within the grace window', () => {
    expect(dueVerdict({ enabled: true, nextAt: local(2026, 12, 1, 9), catchUp: false }, now)).toBe(
      'run',
    )
  })

  it('catches up a long missed task once if it asks for it', () => {
    const missed = { enabled: true, nextAt: now - GRACE_MS - MINUTE_MS }

    expect(dueVerdict({ ...missed, catchUp: true }, now)).toBe('catchUp')
    expect(dueVerdict({ ...missed, catchUp: false }, now)).toBe('missed')
  })

  it('waits for a future, disabled or unscheduled task', () => {
    expect(dueVerdict({ enabled: true, nextAt: now + MINUTE_MS, catchUp: true }, now)).toBe('wait')
    expect(dueVerdict({ enabled: false, nextAt: now - MINUTE_MS, catchUp: true }, now)).toBe('wait')
    expect(dueVerdict({ enabled: true, nextAt: 0, catchUp: true }, now)).toBe('wait')
  })
})
