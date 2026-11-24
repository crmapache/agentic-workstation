import { rm, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { CalendarEvent, CalendarSourceDraft } from '@shared/calendar'

import { Vault } from '../storage/vault'
import { CalendarService } from './calendar-service'
import { CalendarStore } from './calendar-store'

const plainCipher = {
  available: () => true,
  encrypt: (text: string) => Buffer.from(text),
  decrypt: (data: Buffer) => data.toString(),
}

/** Сейчас - понедельник 23 ноября 2026, 09:00 местного. */
const NOW = new Date(2026, 10, 23, 9).getTime()
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime()
const WEEK = { from: at(23, 0), to: at(30, 0) }

const event = (sourceId: string, title: string, start: number, end: number): CalendarEvent => ({
  key: `${sourceId}|${title}|`,
  sourceId,
  uid: title,
  title,
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
  organizer: { name: 'Ana', email: 'ana@example.com', url: null },
  attendees: [],
  link: null,
  links: [],
})

const ics = (name: string, url: string): CalendarSourceDraft => ({
  id: null,
  kind: 'ics',
  name,
  color: 0,
  visible: true,
  inOverlaps: true,
  url,
})

describe('overlap review', () => {
  let dir = ''
  let service: CalendarService
  let work = ''
  let personal = ''

  const read = (id: string, events: CalendarEvent[]) =>
    service.applyRead(id, { ok: true, events, covered: WEEK, byAi: false })

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aw-calendar-review-'))
    service = await CalendarService.load({
      store: CalendarStore.inDir(dir, await Vault.load(join(dir, 'calendar.vault'), plainCipher)),
      now: () => NOW,
      onState: () => undefined,
      post: () => undefined,
      zone: () => 'UTC',
    })

    const a = await service.save(ics('Client A', 'https://cal.example/a.ics'))
    const b = await service.save(ics('Client B', 'https://cal.example/b.ics'))

    work = a.outcome.ok ? a.outcome.id : ''
    personal = b.outcome.ok ? b.outcome.id : ''
    await read(work, [event(work, 'Review', at(24, 10), at(24, 11))])
    await read(personal, [event(personal, 'Standup', at(24, 10, 30), at(24, 11, 30))])
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('a seen overlap stops counting, and a moved meeting makes a new one', async () => {
    const [overlap] = service.overlapsAhead()

    expect(overlap).toMatchObject({ seen: false, start: at(24, 10, 30), end: at(24, 11) })
    expect(service.state().upcomingOverlaps).toBe(1)

    const state = await service.markOverlap(overlap?.key ?? '', true)

    expect(state.upcomingOverlaps).toBe(0)
    expect(state.seenOverlaps).toEqual([overlap?.key])
    expect(service.overlapsAhead()[0]?.seen).toBe(true)

    await read(personal, [event(personal, 'Standup', at(24, 10, 45), at(24, 11, 30))])

    expect(service.state().upcomingOverlaps).toBe(1)
  })

  it('remembers who gave way: a move out of an overlap goes to the history and the brief', async () => {
    await read(work, [
      event(work, 'Review', at(24, 10), at(24, 11)),
      event(work, 'Planning', at(25, 10), at(25, 11)),
    ])
    await read(personal, [
      event(personal, 'Standup', at(24, 14), at(24, 15)),
      event(personal, 'Retro', at(25, 10, 30), at(25, 11, 30)),
    ])

    const onDisk = JSON.parse(await readFile(join(dir, 'calendar.json'), 'utf8')) as {
      moves: { title: string; kind: string; clashed: boolean; to: number }[]
    }

    expect(onDisk.moves).toEqual([
      expect.objectContaining({ title: 'Standup', kind: 'moved', clashed: true, to: at(24, 14) }),
    ])

    const [overlap] = service.overlapsAhead()
    const brief = service.overlapBrief(overlap?.key ?? '')

    expect(brief.ok && brief.label).toBe('Overlap: Planning / Retro')
    expect(brief.ok && brief.text).toContain('"Standup" (Client B, organizer Ana) moved from')
    expect(brief.ok && brief.text).toContain('it was in an overlap')
    expect(brief.ok && brief.text).toContain('never mention the other call')
    expect(brief.ok && brief.text).toContain('Send nothing and change nothing')
    expect(service.overlapBrief('gone')).toEqual({ ok: false })
  })
})
