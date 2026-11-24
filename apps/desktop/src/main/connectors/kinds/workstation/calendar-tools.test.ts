import { it, expect, describe } from 'vitest'

import type { CalendarEvent, CalendarState } from '@shared/calendar'
import { IDLE_SYNC } from '@shared/calendar'
import { meetingsOf, overlapsOf } from '@shared/calendar-overlaps'
import { DEFAULT_CALENDAR_SETTINGS } from '@shared/calendar-settings'

import type { CalendarPort, WorkstationPorts } from '../../../workstation/workstation-link'
import { CALENDAR_TOOLS } from './calendar-tools'

const at = (hour: number, minute = 0) => new Date(2026, 10, 24, hour, minute).getTime()

const event = (key: string, start: number, end: number): CalendarEvent => ({
  key,
  sourceId: 'work',
  uid: key,
  title: key,
  start,
  end,
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

const STATE: CalendarState = {
  sources: [
    {
      id: 'work',
      name: 'Work Outlook',
      color: 0,
      visible: true,
      inOverlaps: true,
      kind: 'ics',
      urlMask: 'https://x/…',
      sync: { ...IDLE_SYNC, lastOkAt: at(9) },
    },
  ],
  settings: DEFAULT_CALENDAR_SETTINGS,
  revision: 1,
  upcomingOverlaps: 1,
  nextOverlaps: [],
  seenOverlaps: [],
  vault: true,
}

const portsWith = (synced: boolean[] = []): WorkstationPorts => {
  const meetings = meetingsOf([
    event('Client call', at(10), at(11)),
    event('Review', at(10, 30), at(12)),
  ])
  const calendar: CalendarPort = {
    state: () => STATE,
    meetingsIn: () => ({ meetings, overlaps: overlapsOf(meetings) }),
    sync: (withAi) => {
      synced.push(withAi)

      return 1
    },
  }

  return { calendar: () => calendar } as unknown as WorkstationPorts
}

const tool = (name: string) => {
  const found = CALENDAR_TOOLS.find((one) => one.name === name)

  if (!found) throw new Error(name)

  return found
}

const call = { launch: null, signal: undefined }

describe('calendar tools', () => {
  it('lists calls with calendar names and overlap marks, reading only', async () => {
    const result = (await tool('calendar_events').run(
      { from: '2026-11-24' },
      portsWith(),
      call,
    )) as {
      events: { title: string; calendars: string[]; overlaps_another: boolean }[]
      sources: { name: string; read_by_ai: boolean }[]
    }

    expect(tool('calendar_events').access).toBe('read')
    expect(result.sources).toEqual([
      expect.objectContaining({ name: 'Work Outlook', read_by_ai: false }),
    ])
    expect(result.events.map((one) => [one.title, one.calendars, one.overlaps_another])).toEqual([
      ['Client call', ['Work Outlook'], true],
      ['Review', ['Work Outlook'], true],
    ])
  })

  it('gives overlaps with both meetings and the shared span', async () => {
    const [overlap] = (await tool('calendar_conflicts').run({}, portsWith(), call)) as {
      first: { title: string }
      second: { title: string }
      start: string
    }[]

    expect(overlap?.first.title).toBe('Client call')
    expect(overlap?.second.title).toBe('Review')
    expect(overlap?.start).toMatch(/T10:30/)
  })

  it('checks the period', async () => {
    await expect(
      tool('calendar_events').run({ from: '2026-11-24', to: '2026-11-01' }, portsWith(), call),
    ).rejects.toThrow(/after "from"/)
  })

  it('syncs without AI unless asked', async () => {
    const synced: boolean[] = []

    await tool('calendar_sync').run({}, portsWith(synced), call)
    await tool('calendar_sync').run({ include_ai: true }, portsWith(synced), call)

    expect(tool('calendar_sync').access).toBe('write')
    expect(synced).toEqual([false, true])
  })
})
