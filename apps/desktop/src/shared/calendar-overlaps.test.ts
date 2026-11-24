import { it, expect, describe } from 'vitest'

import type { CalendarEvent } from './calendar'
import { meetingsOf, overlapKey, overlapsOf } from './calendar-overlaps'

/** 24 ноября 2026, время UTC: правилам накладок пояс не нужен. */
const at = (hour: number, minute = 0) => Date.UTC(2026, 10, 24, hour, minute)

const event = (patch: Partial<CalendarEvent> & { key: string }): CalendarEvent => ({
  sourceId: 'work',
  uid: patch.key,
  title: patch.key,
  start: at(10),
  end: at(11),
  allDay: null,
  status: 'confirmed',
  busy: 'busy',
  response: 'accepted',
  joinUrl: null,
  location: null,
  locationUrl: null,
  organizer: null,
  attendees: [],
  link: null,
  links: [],
  ...patch,
})

describe('calendar duplicates', () => {
  it('merges the same meeting from two calendars into one with both sources', () => {
    const meetings = meetingsOf(
      [
        event({ key: 'p1', sourceId: 'personal', uid: 'x@google', title: 'Sync' }),
        event({ key: 'w1', sourceId: 'work', uid: 'x@google', title: 'Sync' }),
      ],
      ['work', 'personal'],
    )

    expect(meetings).toHaveLength(1)
    expect(meetings[0]?.key).toBe('w1')
    expect(meetings[0]?.sourceIds).toEqual(['work', 'personal'])
  })

  it('treats same time with the same title or call link as a duplicate', () => {
    const byTitle = meetingsOf([
      event({ key: 'a', title: 'Weekly  Sync ' }),
      event({ key: 'b', sourceId: 'ai', title: 'weekly sync', start: at(10) + 30_000 }),
    ])
    const byLink = meetingsOf([
      event({ key: 'a', title: 'Design review', joinUrl: 'https://meet.google.com/abc' }),
      event({ key: 'b', title: 'Review (Outlook)', joinUrl: 'https://meet.google.com/abc' }),
    ])

    expect(byTitle).toHaveLength(1)
    expect(byLink).toHaveLength(1)
  })

  it('keeps different meetings at the same time apart', () => {
    expect(meetingsOf([event({ key: 'a' }), event({ key: 'b' })])).toHaveLength(2)
  })
})

describe('calendar overlaps', () => {
  it('finds two meetings that share time and the shared span', () => {
    const meetings = meetingsOf([
      event({ key: 'a', start: at(10), end: at(11) }),
      event({ key: 'b', start: at(10, 30), end: at(12) }),
    ])
    const [overlap, ...rest] = overlapsOf(meetings)

    expect(rest).toEqual([])
    expect(overlap).toMatchObject({ a: 'a', b: 'b', start: at(10, 30), end: at(11), soft: false })
  })

  it('does not count back-to-back meetings or duplicates', () => {
    const meetings = meetingsOf([
      event({ key: 'a', start: at(10), end: at(11) }),
      event({ key: 'b', start: at(11), end: at(12) }),
      event({ key: 'c', sourceId: 'personal', uid: 'b', start: at(11), end: at(12) }),
    ])

    expect(overlapsOf(meetings)).toEqual([])
  })

  it('skips all-day, cancelled, declined and free events', () => {
    const meetings = meetingsOf([
      event({ key: 'main' }),
      event({
        key: 'day',
        allDay: { from: '2026-11-24', to: '2026-11-25' },
        start: at(0),
        end: at(24),
      }),
      event({ key: 'gone', status: 'cancelled' }),
      event({ key: 'no', response: 'declined' }),
      event({ key: 'free', busy: 'free' }),
    ])

    expect(overlapsOf(meetings)).toEqual([])
  })

  it('marks an overlap with a tentative meeting as soft', () => {
    const meetings = meetingsOf([event({ key: 'a' }), event({ key: 'b', response: 'tentative' })])

    expect(overlapsOf(meetings)[0]?.soft).toBe(true)
  })

  it('ignores sources left out of overlaps unless a duplicate source counts', () => {
    const meetings = meetingsOf([
      event({ key: 'a' }),
      event({ key: 'holiday', sourceId: 'holidays' }),
      event({ key: 'b', sourceId: 'holidays', title: 'Team' }),
      event({ key: 'b2', sourceId: 'work', title: 'Team' }),
    ])
    const overlaps = overlapsOf(meetings, (sourceId) => sourceId !== 'holidays')

    expect(overlaps.map((overlap) => [overlap.a, overlap.b])).toEqual([['a', 'b']])
  })

  it('finds every pair when three meetings pile up', () => {
    const meetings = meetingsOf([
      event({ key: 'a', start: at(9), end: at(12) }),
      event({ key: 'b', start: at(10), end: at(11) }),
      event({ key: 'c', start: at(10, 30), end: at(13) }),
    ])

    expect(overlapsOf(meetings)).toHaveLength(3)
  })

  it('keeps the overlap key for the same pair and changes it when a meeting moves', () => {
    const before = meetingsOf([event({ key: 'a' }), event({ key: 'b', start: at(10, 30) })])
    const again = meetingsOf([event({ key: 'b', start: at(10, 30) }), event({ key: 'a' })])
    const moved = meetingsOf([event({ key: 'a' }), event({ key: 'b', start: at(10, 15) })])
    const keyOf = (meetings: typeof before) => overlapsOf(meetings)[0]?.key

    expect(keyOf(again)).toBe(keyOf(before))
    expect(keyOf(moved)).not.toBe(keyOf(before))
    const [first, second] = before

    expect(first && second && overlapKey(first, second)).toBe(keyOf(before))
  })
})
