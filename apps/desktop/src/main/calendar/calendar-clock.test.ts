import { it, expect, describe } from 'vitest'

import type { CalendarEvent, CalendarSource } from '@shared/calendar'
import { meetingsOf } from '@shared/calendar-overlaps'
import { DEFAULT_CALENDAR_SETTINGS } from '@shared/calendar-settings'
import { MINUTE_MS } from '@shared/time-units'

import { morningDue, morningPlan } from './calendar-morning'
import { movesBetween } from './calendar-moves'
import { leftLabel, dueReminders, reminderCard } from './calendar-reminders'

/** Вторник 24 ноября 2026, местное время. */
const at = (hour: number, minute = 0, day = 24) => new Date(2026, 10, day, hour, minute).getTime()

const event = (
  title: string,
  start: number,
  patch: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  key: `work|${title}@${start}|`,
  sourceId: 'work',
  uid: `ai:${title}@${start}`,
  title,
  start,
  end: start + 30 * MINUTE_MS,
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

describe('call reminders', () => {
  const meetings = meetingsOf([
    event('Sync', at(10), { joinUrl: 'https://meet.google.com/a-b-c' }),
    event('Declined', at(10), { response: 'declined' }),
  ])

  it('reminds once per term, and once when several terms passed while the IDE was closed', () => {
    const early = dueReminders(meetings, [60, 10], {}, at(9, 5))

    expect(early.due.map((one) => [one.meeting.event.title, one.minutesLeft])).toEqual([
      ['Sync', 55],
    ])
    expect(dueReminders(meetings, [60, 10], early.reminded, at(9, 6)).due).toEqual([])
    expect(dueReminders(meetings, [60, 10], early.reminded, at(9, 51)).due).toHaveLength(1)

    const late = dueReminders(meetings, [60, 10], {}, at(9, 55))

    expect(late.due.map((one) => one.minutesLeft)).toEqual([5])
    expect(Object.keys(late.reminded)).toHaveLength(2)
    expect(dueReminders(meetings, [10], {}, at(10, 5)).due).toEqual([])
  })

  it('puts Join first when the call has a link', () => {
    const [due] = dueReminders(meetings, [10], {}, at(9, 50)).due
    const card = due && reminderCard(due, [])

    expect(card?.title).toBe('Sync')
    expect(card?.body).toBe('In 10 min · **10:00 - 10:30**')
    expect(card?.actions.map((one) => [one.kind, one.value])).toEqual([
      ['open', 'https://meet.google.com/a-b-c'],
      ['showCalendar', ''],
    ])
    expect([leftLabel(90), leftLabel(120), leftLabel(2 * 24 * 60)]).toEqual([
      '1 h 30 min',
      '2 h',
      '2 d',
    ])
  })

  it('keeps the meeting name as the title and puts the place on its own line', () => {
    const [meeting] = meetingsOf([event('Demo', at(10), { location: 'Microsoft Teams Meeting' })])
    const support = { id: 'work', name: 'Support', kind: 'ics' } as CalendarSource
    const card = meeting && reminderCard({ meeting, minutesLeft: 0 }, [support])

    expect(card?.title).toBe('Demo')
    expect(card?.source).toBe('Calendar')
    expect(card?.body).toBe('Starting now · **10:00 - 10:30** · Support  \nMicrosoft Teams Meeting')
  })
})

describe('morning sync', () => {
  const settings = DEFAULT_CALENDAR_SETTINGS
  const source = (id: string, kind: CalendarSource['kind']) =>
    ({ id, name: id, kind }) as CalendarSource

  it('runs once on a work day within working hours, also when the IDE opens late', () => {
    expect(morningDue(settings, '', at(8, 59))).toBeNull()
    expect(morningDue(settings, '', at(9))).toBe('2026-11-24')
    expect(morningDue(settings, '', at(13))).toBe('2026-11-24')
    expect(morningDue(settings, '2026-11-24', at(13))).toBeNull()
    expect(morningDue(settings, '', at(18))).toBeNull()
    // Суббота - не рабочий день.
    expect(morningDue(settings, '', at(10, 0, 28))).toBeNull()
    expect(morningDue({ ...settings, morningSync: 'off' }, '', at(10))).toBeNull()
  })

  it('reads browser sources, only reminds about the screen one, skips what was read today', () => {
    const sources = [
      source('outlook', 'ai-browser'),
      source('app', 'ai-screen'),
      source('fresh', 'ai-browser'),
      source('google', 'google'),
    ]
    const lastOk = (id: string) => (id === 'fresh' ? at(7) : at(17, 0, 23))
    const plan = morningPlan(settings, sources, lastOk, at(9))

    expect(plan.read.map((one) => one.id)).toEqual(['outlook'])
    expect(plan.remind.map((one) => one.id)).toEqual(['app'])
    expect(
      morningPlan({ ...settings, morningSync: 'remind' }, sources, lastOk, at(9)).remind,
    ).toHaveLength(2)
  })
})

describe('moves between reads', () => {
  const covered = { from: at(0), to: at(0, 0, 30) }
  const input = {
    covered,
    now: at(8),
    byTitle: true,
    clashed: (one: CalendarEvent) => one.title === 'Review',
  }

  it('finds a moved AI event by title, a declined one in place and a removed one', () => {
    const moves = movesBetween({
      ...input,
      previous: [
        event('Review', at(10)),
        event('Standup', at(11)),
        event('Old', at(12)),
        event('Past', at(7)),
      ],
      next: [
        event('Review', at(15)),
        event('Standup', at(11), { response: 'declined' }),
        event('Past', at(7, 30)),
      ],
    })

    expect(moves.map((move) => [move.title, move.kind, move.to, move.clashed])).toEqual([
      ['Review', 'moved', at(15), true],
      ['Standup', 'declined', null, false],
      ['Old', 'removed', null, false],
    ])
  })

  it('says nothing about events outside the window that was read', () => {
    expect(movesBetween({ ...input, previous: [event('Far', at(10, 0, 31))], next: [] })).toEqual(
      [],
    )
  })
})
