import { rm, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { CalendarEvent, CalendarSourceDraft } from '@shared/calendar'
import type { InboxItem } from '@shared/inbox'

import { Vault } from '../storage/vault'
import { CalendarService } from './calendar-service'
import type { SourceResult } from './calendar-snapshot'
import { CalendarStore } from './calendar-store'
import { CalendarSync } from './calendar-sync'
import type { AiSource } from './calendar-sync'

const plainCipher = {
  available: () => true,
  encrypt: (text: string) => Buffer.from(text),
  decrypt: (data: Buffer) => data.toString(),
}

/** Сейчас - понедельник 23 ноября 2026, 09:00 местного. */
const NOW = new Date(2026, 10, 23, 9).getTime()
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime()

const event = (sourceId: string, key: string, start: number, end: number): CalendarEvent => ({
  key: `${sourceId}|${key}|`,
  sourceId,
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

const ics = (
  name: string,
  url = 'https://cal.example/secret-token/basic.ics',
): CalendarSourceDraft => ({
  id: null,
  kind: 'ics',
  name,
  color: 0,
  visible: true,
  inOverlaps: true,
  url,
})

const browser = (name: string): CalendarSourceDraft => ({
  id: null,
  kind: 'ai-browser',
  name,
  color: 1,
  visible: true,
  inOverlaps: true,
  connectorId: 'b',
  profile: 'Work',
  url: 'https://outlook.office.com/calendar/view/week',
  hints: '',
  allowClicks: false,
  weeksAhead: 1,
  ai: [{ provider: 'claude', model: '', effort: '' }],
})

/** Окно, которое «прочитал» источник: эта неделя. */
const WEEK = { from: at(23, 0), to: at(30, 0) }

const read = (events: CalendarEvent[]): SourceResult => ({
  ok: true,
  events,
  covered: WEEK,
  byAi: false,
})

describe('CalendarService', () => {
  let dir = ''
  let posted: InboxItem[] = []
  let service: CalendarService

  const open = async () =>
    CalendarService.load({
      store: CalendarStore.inDir(dir, await Vault.load(join(dir, 'calendar.vault'), plainCipher)),
      now: () => NOW,
      onState: () => undefined,
      post: (item) => posted.push(item),
      zone: () => 'UTC',
    })

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aw-calendar-'))
    posted = []
    service = await open()
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('keeps the ICS link in the vault and only its host on disk', async () => {
    const { outcome } = await service.save(ics('Work'))
    const onDisk = await readFile(join(dir, 'calendar.json'), 'utf8')

    expect(outcome.ok).toBe(true)
    expect(onDisk).not.toContain('secret-token')
    expect(onDisk).toContain('https://cal.example/…')
    expect(outcome.ok && service.icsUrl(outcome.id)).toBe(
      'https://cal.example/secret-token/basic.ics',
    )
  })

  it('announces a new overlap ahead once, and again only when a meeting moves', async () => {
    const a = await service.save(ics('Work'))
    const b = await service.save(ics('Personal', 'https://cal.example/other.ics'))
    const work = a.outcome.ok ? a.outcome.id : ''
    const personal = b.outcome.ok ? b.outcome.id : ''

    await service.applyRead(work, read([event(work, 'review', at(24, 10), at(24, 11))]))
    await service.applyRead(
      personal,
      read([event(personal, 'gym', at(24, 10, 30), at(24, 11, 30))]),
    )
    await service.applyRead(
      personal,
      read([event(personal, 'gym', at(24, 10, 30), at(24, 11, 30))]),
    )

    expect(posted).toHaveLength(1)
    expect(posted[0]?.title).toBe('Calls overlap')
    expect(posted[0]?.actions[0]?.kind).toBe('showCalendar')
    expect(service.state().upcomingOverlaps).toBe(1)
    expect(service.state().nextOverlaps).toEqual([at(24, 10, 30)])

    await service.applyRead(
      personal,
      read([event(personal, 'gym', at(24, 10, 45), at(24, 11, 30))]),
    )

    expect(posted).toHaveLength(2)
  })

  it('keeps the old snapshot and records the reason when a read fails', async () => {
    const saved = await service.save(ics('Work'))
    const id = saved.outcome.ok ? saved.outcome.id : ''

    await service.applyRead(id, read([event(id, 'standup', at(23, 9), at(23, 9, 30))]))
    await service.applyRead(id, { ok: false, failure: 'network' })

    const sync = service.state().sources[0]?.sync

    expect(sync).toMatchObject({ failure: 'network', count: 1, lastOkAt: NOW })
    expect(service.eventsIn(WEEK.from, WEEK.to)).toHaveLength(1)
  })

  it('survives a restart: sources, snapshot and announced overlaps come back', async () => {
    const saved = await service.save(ics('Work'))
    const id = saved.outcome.ok ? saved.outcome.id : ''

    await service.applyRead(
      id,
      read([event(id, 'a', at(24, 10), at(24, 11)), event(id, 'b', at(24, 10, 30), at(24, 12))]),
    )

    const again = await open()

    expect(again.sources.map((source) => source.name)).toEqual(['Work'])
    expect(again.eventsIn(WEEK.from, WEEK.to)).toHaveLength(2)
    await again.applyRead(
      id,
      read([event(id, 'a', at(24, 10), at(24, 11)), event(id, 'b', at(24, 10, 30), at(24, 12))]),
    )
    expect(posted).toHaveLength(1)
  })

  it('hides a source from the grid and overlaps without forgetting its events', async () => {
    const saved = await service.save(ics('Work'))
    const id = saved.outcome.ok ? saved.outcome.id : ''

    await service.applyRead(id, read([event(id, 'a', at(24, 10), at(24, 11))]))
    await service.patch(id, { visible: false })

    expect(service.eventsIn(WEEK.from, WEEK.to)).toEqual([])
    await service.patch(id, { visible: true })
    expect(service.eventsIn(WEEK.from, WEEK.to)).toHaveLength(1)
  })
})

describe('CalendarSync', () => {
  let dir = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aw-calendar-sync-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reads AI sources one at a time and only on request; cancel stops the running one', async () => {
    const service = await CalendarService.load({
      store: CalendarStore.inDir(dir, await Vault.load(join(dir, 'calendar.vault'), plainCipher)),
      now: () => NOW,
      onState: () => undefined,
      post: () => undefined,
      zone: () => 'UTC',
    })
    let running = 0
    let most = 0
    const started: string[] = []
    const releases: (() => void)[] = []
    const sync = new CalendarSync(
      service,
      {
        direct: () => Promise.resolve(read([])),
        ai: (source: AiSource, signal: AbortSignal) => {
          started.push(source.name)
          running += 1
          most = Math.max(most, running)

          return new Promise<SourceResult>((resolve) => {
            const done = (result: SourceResult) => {
              running -= 1
              resolve(result)
            }

            signal.addEventListener('abort', () => done({ ok: false, failure: 'cancelled' }))
            releases.push(() => done(read([])))
          })
        },
      },
      () => NOW,
    )

    await service.save(browser('Work A'))
    await service.save(browser('Work B'))
    sync.viewed()
    expect(started).toEqual([])

    sync.sync(null, true)
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(started).toEqual(['Work A'])
    expect(service.state().sources.map((source) => source.sync.phase)).toEqual([
      'running',
      'queued',
    ])

    releases[0]?.()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(started).toEqual(['Work A', 'Work B'])

    sync.cancel(null)
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(most).toBe(1)
    expect(
      service.state().sources.map((source) => [source.sync.phase, source.sync.failure]),
    ).toEqual([
      ['idle', null],
      ['idle', 'cancelled'],
    ])
    sync.stop()
  })
})
