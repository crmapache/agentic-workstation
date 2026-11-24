import { it, expect, describe } from 'vitest'

import type { CalendarEvent } from '@shared/calendar'
import { meetingsOf, overlapsOf } from '@shared/calendar-overlaps'

import { allDayOn, blocksOn, periodOf, isPastMeeting, steppedAnchor } from './calendar.utils'

/** Местное время: 23 ноября 2026 - понедельник. */
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime()

const event = (patch: Partial<CalendarEvent> & { key: string }): CalendarEvent => ({
  sourceId: 'work',
  uid: patch.key,
  title: patch.key,
  start: at(24, 10),
  end: at(24, 11),
  allDay: null,
  status: 'confirmed',
  busy: 'busy',
  response: 'accepted',
  joinUrl: null,
  location: null,
  locationUrl: null,
  format: 'unknown',
  organizer: null,
  attendees: [],
  link: null,
  links: [],
  ...patch,
})

describe('calendar period', () => {
  it('starts a week on Monday and steps by weeks or days', () => {
    const week = periodOf('week', at(26, 15))

    expect(week.from).toBe(at(23, 0))
    expect(week.to).toBe(at(30, 0))
    expect(week.days).toHaveLength(7)
    expect(periodOf('day', at(26, 15))).toMatchObject({ from: at(26, 0), to: at(27, 0) })
    expect(steppedAnchor('week', at(26, 15), 1)).toBe(at(3 + 30, 0))
    expect(steppedAnchor('day', at(26, 15), -1)).toBe(at(25, 0))
  })

  it('shows a month as six weeks from the Monday before the 1st and steps by months', () => {
    const month = periodOf('month', at(26, 15))

    // 1 ноября 2026 - воскресенье: сетка с понедельника 26 октября.
    expect(month.from).toBe(new Date(2026, 9, 26).getTime())
    expect(month.days).toHaveLength(42)
    expect(month.month).toBe(at(1, 0))
    expect(steppedAnchor('month', at(26, 15), 1)).toBe(new Date(2026, 11, 1).getTime())
  })
})

describe('calendar day layout', () => {
  it('puts overlapping meetings side by side and marks the clash', () => {
    const meetings = meetingsOf([
      event({ key: 'a', start: at(24, 10), end: at(24, 11) }),
      event({ key: 'b', start: at(24, 10, 30), end: at(24, 12) }),
      event({ key: 'c', start: at(24, 13), end: at(24, 14) }),
    ])
    const blocks = blocksOn(meetings, overlapsOf(meetings), at(24, 0))

    expect(
      blocks.map((block) => [block.meeting.key, block.column, block.columns, block.clashing]),
    ).toEqual([
      ['a', 0, 2, true],
      ['b', 1, 2, true],
      ['c', 0, 1, false],
    ])
    expect(blocks[0]).toMatchObject({ startMinute: 600, endMinute: 660 })
  })

  it('cuts a meeting over midnight into both days and gives a short one a visible height', () => {
    const meetings = meetingsOf([
      event({ key: 'late', start: at(24, 23), end: at(25, 1) }),
      event({ key: 'quick', start: at(25, 9), end: at(25, 9, 5) }),
    ])

    expect(blocksOn(meetings, [], at(24, 0))[0]).toMatchObject({
      startMinute: 1380,
      endMinute: 1440,
    })
    expect(
      blocksOn(meetings, [], at(25, 0)).map((block) => [block.startMinute, block.endMinute]),
    ).toEqual([
      [0, 60],
      [540, 560],
    ])
  })

  it('puts the shared span inside each clashing block, and all-day events by date', () => {
    const meetings = meetingsOf([
      event({ key: 'a', start: at(24, 10), end: at(24, 11) }),
      event({ key: 'b', start: at(24, 10, 30), end: at(24, 12) }),
      event({ key: 'trip', allDay: { from: '2026-11-24', to: '2026-11-26' } }),
    ])
    const [a, b] = blocksOn(meetings, overlapsOf(meetings), at(24, 0))

    // Общие 10:30-11:00: вторая половина часа «a» и первая треть полутора часов «b».
    expect(a?.zones).toEqual([{ top: 0.5, height: 0.5, soft: false }])
    expect(b?.zones).toEqual([{ top: 0, height: 1 / 3, soft: false }])
    expect(allDayOn(meetings, at(25, 0)).map(({ key }) => key)).toEqual(['trip'])
    expect(allDayOn(meetings, at(26, 0))).toEqual([])
  })
})

describe('past meetings', () => {
  it('dims a meeting once it ends, an all-day one once its last day is behind', () => {
    const meeting = (one: CalendarEvent) => ({
      key: one.key,
      event: one,
      sourceIds: [one.sourceId],
    })
    const call = meeting(event({ key: 'call', start: at(24, 10), end: at(24, 11) }))
    const trip = meeting(event({ key: 'trip', allDay: { from: '2026-11-23', to: '2026-11-25' } }))

    expect(isPastMeeting(call, at(24, 10, 30))).toBe(false)
    expect(isPastMeeting(call, at(24, 11))).toBe(true)
    expect(isPastMeeting(trip, at(24, 23, 59))).toBe(false)
    expect(isPastMeeting(trip, at(25, 0))).toBe(true)
  })
})
