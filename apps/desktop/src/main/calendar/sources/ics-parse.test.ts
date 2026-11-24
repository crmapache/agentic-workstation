import { it, expect, describe } from 'vitest'

import { parseIcs } from './ics-parse'

/** Ноябрь - декабрь 2026, мс UTC. */
const WINDOW = { from: Date.UTC(2026, 10, 1), to: Date.UTC(2026, 11, 31) }

const ics = (...lines: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...lines, 'END:VCALENDAR'].join('\r\n')

const vevent = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n')

/** Пояс Outlook с виндовым именем и описанием в файле: зима -06:00 без летнего времени. */
const CENTRAL_AMERICA = [
  'BEGIN:VTIMEZONE',
  'TZID:Central America Standard Time',
  'BEGIN:STANDARD',
  'DTSTART:16010101T000000',
  'TZOFFSETFROM:-0600',
  'TZOFFSETTO:-0600',
  'END:STANDARD',
  'END:VTIMEZONE',
].join('\r\n')

const parse = (text: string, zone = 'UTC') => parseIcs(text, 'src', WINDOW, zone)

describe('ICS parsing', () => {
  it('expands a weekly series with an excluded and a moved occurrence', () => {
    const text = ics(
      vevent(
        'UID:weekly-1',
        'SUMMARY:Standup',
        'DTSTART:20261102T150000Z',
        'DTEND:20261102T153000Z',
        'RRULE:FREQ=WEEKLY;COUNT=4',
        'EXDATE:20261109T150000Z',
      ),
      vevent(
        'UID:weekly-1',
        'RECURRENCE-ID:20261116T150000Z',
        'SUMMARY:Standup (moved)',
        'DTSTART:20261116T170000Z',
        'DTEND:20261116T173000Z',
      ),
    )
    const events = parse(text) ?? []

    expect(events.map((event) => [event.title, new Date(event.start).toISOString()])).toEqual([
      ['Standup', '2026-11-02T15:00:00.000Z'],
      ['Standup (moved)', '2026-11-16T17:00:00.000Z'],
      ['Standup', '2026-11-23T15:00:00.000Z'],
    ])
    expect(new Set(events.map((event) => event.key)).size).toBe(3)
  })

  it('reads a Windows zone described in the file', () => {
    const [event] =
      parse(
        ics(
          CENTRAL_AMERICA,
          vevent(
            'UID:cr-1',
            'SUMMARY:Client call',
            'DTSTART;TZID=Central America Standard Time:20261124T090000',
            'DTEND;TZID=Central America Standard Time:20261124T100000',
          ),
        ),
      ) ?? []

    expect(event?.start).toBe(Date.UTC(2026, 10, 24, 15))
    expect(event?.end).toBe(Date.UTC(2026, 10, 24, 16))
  })

  it('maps a Windows zone that the file does not describe', () => {
    const [event] =
      parse(
        ics(
          vevent(
            'UID:pst-1',
            'SUMMARY:Planning',
            'DTSTART;TZID=Pacific Standard Time:20261124T090000',
            'DTEND;TZID=Pacific Standard Time:20261124T100000',
          ),
        ),
      ) ?? []

    expect(event?.start).toBe(Date.UTC(2026, 10, 24, 17))
  })

  it('reads an IANA zone that the file does not describe and floating time on this machine', () => {
    const events =
      parse(
        ics(
          vevent(
            'UID:a',
            'DTSTART;TZID=Europe/Madrid:20261124T090000',
            'DTEND;TZID=Europe/Madrid:20261124T100000',
          ),
          vevent('UID:b', 'DTSTART:20261125T090000', 'DTEND:20261125T100000'),
        ),
        'America/Costa_Rica',
      ) ?? []

    expect(events.map((event) => event.start)).toEqual([
      Date.UTC(2026, 10, 24, 8),
      Date.UTC(2026, 10, 25, 15),
    ])
  })

  it('keeps all-day dates and gives a one-day event without an end its day', () => {
    const events =
      parse(
        ics(
          vevent(
            'UID:trip',
            'SUMMARY:Trip',
            'DTSTART;VALUE=DATE:20261124',
            'DTEND;VALUE=DATE:20261127',
          ),
          vevent('UID:holiday', 'SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20261201'),
        ),
      ) ?? []

    expect(events.map((event) => event.allDay)).toEqual([
      { from: '2026-11-24', to: '2026-11-27' },
      { from: '2026-12-01', to: '2026-12-02' },
    ])
  })

  it('reads status, Outlook busy status, people, the Teams link and other links', () => {
    const [event] =
      parse(
        ics(
          vevent(
            'UID:teams-1',
            'SUMMARY:Review',
            'DTSTART:20261124T150000Z',
            'DTEND:20261124T160000Z',
            'STATUS:CANCELLED',
            'X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE',
            'ORGANIZER;CN=Ana Ruiz:mailto:ana@example.com',
            'ATTENDEE;CN=Ana Ruiz:mailto:ana@example.com',
            'ATTENDEE;CN=Bo Lee;ROLE=OPT-PARTICIPANT:mailto:bo@example.com',
            'ATTACH;FILENAME=Agenda.pdf:https://files.example.com/agenda.pdf',
            'LOCATION:Microsoft Teams Meeting',
            'DESCRIPTION:Join: https://teams.microsoft.com/l/meetup-join/abc and docs https://example.com/doc',
          ),
        ),
      ) ?? []

    expect(event).toMatchObject({
      status: 'cancelled',
      busy: 'tentative',
      organizer: { name: 'Ana Ruiz', email: 'ana@example.com', url: null },
      attendees: [{ name: 'Bo Lee', email: 'bo@example.com', url: null }],
      joinUrl: 'https://teams.microsoft.com/l/meetup-join/abc',
      location: 'Microsoft Teams Meeting',
      locationUrl: null,
      format: 'call',
      links: [
        { label: 'Agenda.pdf', url: 'https://files.example.com/agenda.pdf' },
        { label: 'example.com/doc', url: 'https://example.com/doc' },
      ],
    })
  })

  it('treats TRANSP:TRANSPARENT as free and skips events outside the window', () => {
    const events =
      parse(
        ics(
          vevent(
            'UID:free',
            'DTSTART:20261124T150000Z',
            'DTEND:20261124T160000Z',
            'TRANSP:TRANSPARENT',
          ),
          vevent('UID:old', 'DTSTART:20250101T150000Z', 'DTEND:20250101T160000Z'),
        ),
      ) ?? []

    expect(events.map((event) => [event.uid, event.busy])).toEqual([['free', 'free']])
  })

  it('refuses what is not iCalendar', () => {
    expect(parse('<html>Sign in</html>')).toBeNull()
  })
})
