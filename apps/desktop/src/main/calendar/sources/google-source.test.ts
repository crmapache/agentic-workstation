import { it, expect, describe } from 'vitest'

import { SignedOutError } from '../../connectors/connector-source'
import type { GoogleRequest } from '../../connectors/kinds/google/google-session'
import { readGoogle, googleEventOf } from './google-source'
import type { GoogleFetch } from './google-source'

const WINDOW = { from: Date.UTC(2026, 10, 1), to: Date.UTC(2026, 11, 31) }

describe('Google events', () => {
  it('maps an invite: my answer, Meet link, people, links, iCalUID for duplicates', () => {
    const event = googleEventOf('personal', 'primary', {
      id: 'abc_20261124',
      iCalUID: 'abc@google.com',
      summary: ' Weekly sync ',
      start: { dateTime: '2026-11-24T09:00:00-06:00' },
      end: { dateTime: '2026-11-24T09:30:00-06:00' },
      organizer: { email: 'ana@example.com', displayName: 'Ana' },
      attendees: [
        { email: 'me@example.com', responseStatus: 'tentative', self: true },
        { email: 'ana@example.com', responseStatus: 'accepted', organizer: true },
        { email: 'bo@example.com', displayName: 'Bo', responseStatus: 'needsAction' },
      ],
      conferenceData: {
        entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/x-y-z' }],
      },
      description: 'Agenda: https://docs.google.com/document/d/1 and https://meet.google.com/x-y-z',
      attachments: [{ title: 'Slides', fileUrl: 'https://drive.google.com/file/d/2' }],
      htmlLink: 'https://www.google.com/calendar/event?eid=abc',
    })

    expect(event).toMatchObject({
      key: 'personal|primary/abc_20261124|',
      uid: 'abc@google.com',
      title: 'Weekly sync',
      start: Date.UTC(2026, 10, 24, 15),
      end: Date.UTC(2026, 10, 24, 15, 30),
      response: 'tentative',
      joinUrl: 'https://meet.google.com/x-y-z',
      format: 'call',
      organizer: { name: 'Ana', email: 'ana@example.com', url: null },
      // Я и организатор - не гости.
      attendees: [{ name: 'Bo', email: 'bo@example.com', url: null }],
      link: 'https://www.google.com/calendar/event?eid=abc',
      // Звонок и само событие стоят своими кнопками - в прочих ссылках их нет.
      links: [
        { label: 'Slides', url: 'https://drive.google.com/file/d/2' },
        { label: 'docs.google.com/document/d/1', url: 'https://docs.google.com/document/d/1' },
      ],
      busy: 'busy',
    })
  })

  it('reads all-day, free, out of office and skips working location', () => {
    const allDay = googleEventOf('p', 'primary', {
      id: 'a',
      start: { date: '2026-11-26' },
      end: { date: '2026-11-27' },
      transparency: 'transparent',
    })
    const away = googleEventOf('p', 'primary', {
      id: 'b',
      eventType: 'outOfOffice',
      start: { dateTime: '2026-11-24T09:00:00Z' },
      end: { dateTime: '2026-11-24T18:00:00Z' },
    })
    const home = googleEventOf('p', 'primary', {
      id: 'c',
      eventType: 'workingLocation',
      start: { date: '2026-11-24' },
      end: { date: '2026-11-25' },
    })

    expect(allDay).toMatchObject({ allDay: { from: '2026-11-26', to: '2026-11-27' }, busy: 'free' })
    expect(away?.busy).toBe('away')
    expect(home).toBeNull()
  })

  it('reads every page of every calendar and answers signed-out by code', async () => {
    const pages: Record<string, unknown> = {
      'primary:': {
        items: [
          {
            id: '1',
            start: { dateTime: '2026-11-24T10:00:00Z' },
            end: { dateTime: '2026-11-24T11:00:00Z' },
          },
        ],
        nextPageToken: 'next',
      },
      'primary:next': {
        items: [
          {
            id: '2',
            start: { dateTime: '2026-11-23T10:00:00Z' },
            end: { dateTime: '2026-11-23T11:00:00Z' },
          },
        ],
      },
      'team:': { items: [] },
    }
    const request: GoogleFetch = <T>(url: string, init?: GoogleRequest) => {
      const calendar = decodeURIComponent(url.split('/calendars/')[1]?.split('/')[0] ?? '')

      const token = init?.query?.['pageToken']

      return Promise.resolve(pages[`${calendar}:${typeof token === 'string' ? token : ''}`] as T)
    }
    const read = await readGoogle(
      request,
      ['primary', 'team'],
      's',
      WINDOW,
      new AbortController().signal,
    )
    const signedOut = await readGoogle(
      () => Promise.reject(new SignedOutError('нет входа')),
      [],
      's',
      WINDOW,
      new AbortController().signal,
    )

    expect(read.ok && read.events.map((event) => event.key)).toEqual([
      's|primary/2|',
      's|primary/1|',
    ])
    expect(signedOut).toEqual({ ok: false, failure: 'signed-out' })
  })
})
