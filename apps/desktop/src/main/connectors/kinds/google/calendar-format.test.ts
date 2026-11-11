import { it, expect, describe } from 'vitest'

import { boundary, eventTime, eventView, needsZone, zoneOffset } from './calendar-format'

describe('zoneOffset', () => {
  it('пояс без летнего времени и с ним', () => {
    expect(zoneOffset('2026-10-25', 'America/Costa_Rica')).toBe('-06:00')
    expect(zoneOffset('2026-07-01', 'America/New_York')).toBe('-04:00')
    expect(zoneOffset('2026-01-15', 'America/New_York')).toBe('-05:00')
    expect(zoneOffset('2026-01-15', 'UTC')).toBe('+00:00')
  })
})

describe('boundary', () => {
  it('дата - местная полночь в поясе календаря, а не UTC', () => {
    expect(boundary('2026-10-25', 'America/Costa_Rica')).toBe('2026-10-25T00:00:00-06:00')
  })

  it('время без смещения - в поясе календаря, со смещением - как есть', () => {
    expect(boundary('2026-10-25T09:00', 'America/Costa_Rica')).toBe('2026-10-25T09:00:00-06:00')
    expect(boundary('2026-10-25T10:00:00+02:00', 'America/Costa_Rica')).toBe(
      '2026-10-25T10:00:00+02:00',
    )
    expect(() => boundary('tomorrow', 'UTC')).toThrow()
  })
})

describe('eventTime', () => {
  it('дата - весь день, время - с поясом и секундами', () => {
    expect(eventTime('2026-10-25', 'UTC')).toEqual({ date: '2026-10-25' })
    expect(eventTime('2026-10-25T09:00', 'America/Costa_Rica')).toEqual({
      dateTime: '2026-10-25T09:00:00',
      timeZone: 'America/Costa_Rica',
    })
    expect(() => eventTime('tomorrow', 'UTC')).toThrow()
  })

  it('пояс календаря нужен только без смещения', () => {
    expect(needsZone('2026-10-25')).toBe(true)
    expect(needsZone('2026-10-25T09:00:00-06:00')).toBe(false)
    expect(needsZone(undefined)).toBe(false)
  })
})

describe('eventView', () => {
  const event = {
    id: 'e1',
    summary: 'Sync',
    start: { dateTime: '2026-10-25T09:00:00-06:00' },
    end: { dateTime: '2026-10-25T09:30:00-06:00' },
    attendees: [
      { email: 'me@x.com', self: true, responseStatus: 'accepted' },
      { email: 'ann@x.com', responseStatus: 'needsAction', organizer: true },
    ],
  }

  it('коротко - без гостей и описания', () => {
    expect(eventView(event, false)).toEqual({
      event_id: 'e1',
      summary: 'Sync',
      start: '2026-10-25T09:00:00-06:00',
      end: '2026-10-25T09:30:00-06:00',
      all_day: false,
      location: null,
      status: null,
      organizer: null,
      my_response: 'accepted',
      guests: 2,
    })
  })

  it('подробно - с гостями', () => {
    expect(eventView(event, true)).toMatchObject({
      attendees: [
        { email: 'me@x.com', response: 'accepted', organizer: false },
        { email: 'ann@x.com', response: 'needsAction', organizer: true },
      ],
    })
  })
})
