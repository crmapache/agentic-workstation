import { randomUUID } from 'node:crypto'

import type {
  CalendarEvent,
  CalendarState,
  CalendarSource,
  CalendarOutcome,
  CalendarSettings,
  CalendarSourceDraft,
  CalendarSourcePatch,
} from '@shared/calendar'
import { IDLE_SYNC } from '@shared/calendar'
import type { CalendarMeeting, CalendarOverlap } from '@shared/calendar-overlaps'
import { meetingsOf, overlapsOf } from '@shared/calendar-overlaps'
import { icsUrl, icsMask, parseCalendarSettings } from '@shared/calendar-parse'
import type { InboxItem } from '@shared/inbox'

import { overlapCard, overlapNews } from './calendar-notify'
import type { SourceResult } from './calendar-snapshot'
import { syncAfter, replaceCovered, isSuspiciousEmpty } from './calendar-snapshot'
import type { StoredEvents, CalendarStore, StoredCalendar } from './calendar-store'
import { icsSecretKey } from './calendar-store'
import { touches, keptWindow, directWindow } from './calendar-window'

/** Сколько начал накладок впереди отдавать окну: дальше листать к ним незачем. */
const NEXT_OVERLAPS_MAX = 50

export type CalendarServiceDeps = {
  store: CalendarStore
  now: () => number
  onState: (state: CalendarState) => void
  /** Карточка о новых накладках - в уведомления IDE. */
  post: (item: InboxItem) => void
}

/** Поля, от которых зависит, что читается: их смена - новый снимок с нуля. */
const specKey = (source: CalendarSource | CalendarSourceDraft): string => {
  const {
    id: _id,
    name: _name,
    color: _color,
    visible: _visible,
    inOverlaps: _in,
    ...spec
  } = source

  return JSON.stringify(spec)
}

/**
 * Календарь звонков (ADR 0114): источники, снимки их событий, настройки и объявленные накладки.
 * Владелец данных - здесь; окну - состоянием после каждой перемены, события - запросом за период.
 * Читает источники движок синка (calendar-sync.ts) и приносит прочитанное в applyRead.
 */
export class CalendarService {
  private revision = 0
  /** Накладки впереди: счётчик на кнопке и начала - окну листать к следующей. */
  private upcoming: number[] = []
  private readonly phases = new Map<string, 'queued' | 'running'>()

  private constructor(
    private calendar: StoredCalendar,
    private events: StoredEvents,
    private readonly deps: CalendarServiceDeps,
  ) {
    this.upcoming = this.upcomingStarts()
  }

  static async load(deps: CalendarServiceDeps): Promise<CalendarService> {
    const { calendar, events } = await deps.store.load()

    return new CalendarService(calendar, events, deps)
  }

  state(): CalendarState {
    return {
      sources: this.calendar.sources.map((source) => {
        const sync = this.calendar.sync[source.id] ?? IDLE_SYNC
        const phase = this.phases.get(source.id)

        return { ...source, sync: phase ? { ...sync, phase } : sync }
      }),
      settings: this.calendar.settings,
      revision: this.revision,
      upcomingOverlaps: this.upcoming.length,
      nextOverlaps: this.upcoming.slice(0, NEXT_OVERLAPS_MAX),
      vault: this.deps.store.vault.available,
    }
  }

  get settings(): CalendarSettings {
    return this.calendar.settings
  }

  get sources(): readonly CalendarSource[] {
    return this.calendar.sources
  }

  source(id: string): CalendarSource | null {
    return this.calendar.sources.find((source) => source.id === id) ?? null
  }

  /** Когда источник читался удачно; null - ещё ни разу. */
  lastOkAt(id: string): number | null {
    return this.calendar.sync[id]?.lastOkAt ?? null
  }

  /** Полная ссылка ICS из хранилища; нет - null. */
  icsUrl(id: string): string | null {
    return this.deps.store.vault.get(icsSecretKey(id))
  }

  /** События видимых источников, задевающие период. */
  eventsIn(from: number, to: number): CalendarEvent[] {
    const window = { from, to }

    return this.calendar.sources
      .filter((source) => source.visible)
      .flatMap((source) => this.events.bySource[source.id] ?? [])
      .filter((event) => touches(window, event.start, event.end))
      .sort((a, b) => a.start - b.start)
  }

  /** Встречи и накладки периода - по тем же правилам, что сетка окна. */
  meetingsIn(
    from: number,
    to: number,
  ): { meetings: CalendarMeeting[]; overlaps: CalendarOverlap[] } {
    const order = this.calendar.sources.map((source) => source.id)
    const meetings = meetingsOf(this.eventsIn(from, to), order)
    const counts = (id: string) => this.source(id)?.inOverlaps === true

    return { meetings, overlaps: overlapsOf(meetings, counts) }
  }

  /**
   * Новый источник или правка. changed - поменялось, что читается (новый, другой календарь или
   * адрес): снимок стёрт, движку пора прочитать заново.
   */
  async save(draft: CalendarSourceDraft): Promise<{ outcome: CalendarOutcome; changed: boolean }> {
    const previous = draft.id ? this.source(draft.id) : null
    const refused = (code: 'invalid' | 'not-found' | 'vault-unavailable') => ({
      outcome: { ok: false as const, code },
      changed: false,
    })

    if (draft.id && !previous) return refused('not-found')

    const id = previous?.id ?? randomUUID()
    let source: CalendarSource

    if (draft.kind === 'ics') {
      const url = draft.url ? icsUrl(draft.url) : null

      if (!url && !previous) return refused('invalid')
      if (url && !this.deps.store.vault.available) return refused('vault-unavailable')
      if (url) await this.deps.store.vault.set(icsSecretKey(id), url.href)

      const urlMask = url ? icsMask(url) : previous?.kind === 'ics' ? previous.urlMask : ''

      // Полная ссылка - только в хранилище: в источник (диск, окно) идёт маска хоста.
      const { url: _url, ...rest } = draft

      source = { ...rest, id, kind: 'ics', urlMask }
    } else {
      source = { ...draft, id }
    }

    const changed =
      !previous ||
      specKey(previous) !== specKey(source) ||
      (draft.kind === 'ics' && draft.url !== '')

    this.calendar = {
      ...this.calendar,
      sources: previous
        ? this.calendar.sources.map((one) => (one.id === id ? source : one))
        : [...this.calendar.sources, source],
      sync: changed ? { ...this.calendar.sync, [id]: IDLE_SYNC } : this.calendar.sync,
    }

    if (changed) await this.replaceEvents(id, [])
    await this.persist()

    return { outcome: { ok: true, state: this.state(), id }, changed }
  }

  async patch(id: string, patch: CalendarSourcePatch): Promise<CalendarState> {
    this.calendar = {
      ...this.calendar,
      sources: this.calendar.sources.map((one) => (one.id === id ? { ...one, ...patch } : one)),
    }
    this.revision += 1
    this.upcoming = this.upcomingStarts()
    await this.persist()

    return this.state()
  }

  async remove(id: string): Promise<CalendarState> {
    const { [id]: _gone, ...sync } = this.calendar.sync

    this.calendar = {
      ...this.calendar,
      sources: this.calendar.sources.filter((one) => one.id !== id),
      sync,
    }
    this.phases.delete(id)
    await this.deps.store.vault.set(icsSecretKey(id), null).catch(() => undefined)
    await this.replaceEvents(id, null)
    await this.persist()

    return this.state()
  }

  async setSettings(patch: Partial<CalendarSettings>): Promise<CalendarState> {
    this.calendar = {
      ...this.calendar,
      settings: parseCalendarSettings(patch, this.calendar.settings),
    }
    await this.persist()

    return this.state()
  }

  /** Фаза синка источника (очередь, идёт); null - стоит. Окну - сразу. */
  setPhase(id: string, phase: 'queued' | 'running' | null): void {
    if (phase) this.phases.set(id, phase)
    else this.phases.delete(id)

    this.deps.onState(this.state())
  }

  /** Прочитанное источником: новый снимок, синк, накладки - и окну. */
  async applyRead(id: string, result: SourceResult): Promise<void> {
    const source = this.source(id)

    this.phases.delete(id)

    if (!source) return

    const now = this.deps.now()
    const previous = this.events.bySource[id] ?? []
    const snapshot = result.ok
      ? replaceCovered(previous, result.events, result.covered, keptWindow(now))
      : previous
    const warned =
      result.ok && result.byAi && isSuspiciousEmpty(previous, result.events, result.covered)

    this.calendar = {
      ...this.calendar,
      sync: {
        ...this.calendar.sync,
        [id]: syncAfter(this.calendar.sync[id] ?? IDLE_SYNC, result, snapshot, warned, now),
      },
    }

    if (result.ok) await this.replaceEvents(id, snapshot)

    this.announce(now)
    await this.persist()
  }

  /** Начала накладок впереди: от сейчас до конца окна прямых источников, по порядку. */
  private upcomingStarts(): number[] {
    const now = this.deps.now()

    return this.meetingsIn(now, directWindow(now).to)
      .overlaps.filter((overlap) => overlap.end > now)
      .map((overlap) => overlap.start)
      .sort((a, b) => a - b)
  }

  /** Новые накладки - одной карточкой, если человек их хочет; объявленные запоминаются. */
  private announce(now: number): void {
    const { meetings, overlaps } = this.meetingsIn(now, directWindow(now).to)
    const upcoming = overlaps.filter((overlap) => overlap.end > now)
    const { fresh, notified } = overlapNews(upcoming, this.calendar.notified, now)

    this.upcoming = upcoming.map((overlap) => overlap.start).sort((a, b) => a - b)
    this.calendar = { ...this.calendar, notified }

    if (fresh.length && this.calendar.settings.notifyOverlaps) {
      const byKey = new Map(meetings.map((meeting) => [meeting.key, meeting]))

      this.deps.post(overlapCard(fresh, byKey, this.calendar.sources))
    }
  }

  /** Снимок источника; null - стереть. Ревизия растёт: окно перечитает свой период. */
  private async replaceEvents(id: string, events: CalendarEvent[] | null): Promise<void> {
    const { [id]: _old, ...rest } = this.events.bySource

    this.events = { version: 1, bySource: events ? { ...rest, [id]: events } : rest }
    this.revision += 1
    this.upcoming = this.upcomingStarts()
    await this.deps.store.writeEvents(this.events)
  }

  private async persist(): Promise<void> {
    this.deps.onState(this.state())
    await this.deps.store.writeCalendar(this.calendar)
  }
}
