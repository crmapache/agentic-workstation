import { it, expect, describe } from 'vitest'

import type { CalendarEvent } from '@shared/calendar'
import { DAY_MS } from '@shared/time-units'

import { replaceCovered, isSuspiciousEmpty } from './calendar-snapshot'

const DAY = Date.UTC(2026, 10, 23)
const event = (key: string, day: number): CalendarEvent => ({
  key,
  sourceId: 's',
  uid: key,
  title: key,
  start: DAY + day * DAY_MS + 10 * 3_600_000,
  end: DAY + day * DAY_MS + 11 * 3_600_000,
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
})

/** ИИ прочитал две недели вперёд от сегодня. */
const COVERED = { from: DAY, to: DAY + 14 * DAY_MS }
const KEPT = { from: DAY - 30 * DAY_MS, to: DAY + 90 * DAY_MS }

describe('source snapshot', () => {
  it('replaces events only inside the window that was read', () => {
    const previous = [event('last week', -5), event('moved away', 2), event('next month', 30)]
    const next = replaceCovered(previous, [event('new', 3)], COVERED, KEPT)

    expect(next.map((one) => one.key)).toEqual(['last week', 'new', 'next month'])
  })

  it('drops what is outside the kept window', () => {
    expect(replaceCovered([event('ancient', -60)], [], COVERED, KEPT)).toEqual([])
  })

  it('flags an empty AI answer where there were several events', () => {
    const previous = [event('a', 1), event('b', 2), event('c', 3)]

    expect(isSuspiciousEmpty(previous, [], COVERED)).toBe(true)
    expect(isSuspiciousEmpty(previous.slice(0, 2), [], COVERED)).toBe(false)
    expect(isSuspiciousEmpty(previous, [event('a', 1)], COVERED)).toBe(false)
  })
})
