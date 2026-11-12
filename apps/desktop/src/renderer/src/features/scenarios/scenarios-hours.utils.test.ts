import { it, expect, describe } from 'vitest'

import type { ScenarioSchedule } from '@shared/scenarios'

import {
  nextDue,
  countdown,
  clockLabel,
  isoWeekday,
  defaultHour,
  timetableOf,
} from './scenarios-hours.utils'

const hour = (id: string, nextAt: number, missedAt = 0): ScenarioSchedule => ({
  id,
  scenarioId: 's',
  scope: 'project',
  at: 9 * 60,
  repeat: nextAt ? 'daily' : 'once',
  weekday: 1,
  inputs: {},
  nextAt,
  lastAt: 0,
  missedAt,
  worktree: false,
  provider: 'claude',
})

describe('hours', () => {
  it('offers an hour from now, rounded up to five minutes', () => {
    expect(defaultHour(new Date(2026, 0, 1, 10, 2).getTime())).toBe(11 * 60 + 5)
    expect(clockLabel(9 * 60 + 5)).toBe('09:05')
  })

  it('finds the next weekly day', () => {
    const from = new Date(2026, 9, 19, 12, 0).getTime()

    expect(new Date(nextDue({ at: 8 * 60, repeat: 'weekly', weekday: 5 }, from)).getDay()).toBe(5)
    expect(countdown(90 * 60_000)).toBe('1h')
  })

  it('skips the weekend for weekdays and counts Sunday as day seven', () => {
    // 2026-10-24 - суббота: ближайший будний - понедельник.
    const saturday = new Date(2026, 9, 24, 12, 0).getTime()

    expect(
      new Date(nextDue({ at: 9 * 60, repeat: 'weekdays', weekday: 1 }, saturday)).getDay(),
    ).toBe(1)
    expect(isoWeekday(new Date(2026, 9, 25, 12, 0).getTime())).toBe(7)
  })

  it('groups the timetable by day and keeps a missed one-off on top', () => {
    const now = new Date(2026, 9, 19, 8, 0).getTime()
    const table = timetableOf(
      [hour('a', now + 3_600_000), hour('b', now + 26 * 3_600_000), hour('c', 0, now - 1000)],
      [],
      now,
    )

    expect(table.missed.map((row) => row.schedule.id)).toEqual(['c'])
    expect(table.days.map((day) => day.awayInDays)).toEqual([0, 1])
    expect(table.count).toBe(3)
  })
})
