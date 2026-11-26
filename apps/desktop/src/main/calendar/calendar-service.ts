import { randomUUID } from 'node:crypto'

import type {
  CalendarEvent,
  CalendarState,
  CalendarSource,
  CalendarOutcome,
  CalendarSourceDraft,
  CalendarSourcePatch,
} from '@shared/calendar'
import { IDLE_SYNC, isAiSourceKind } from '@shared/calendar'
import type { CalendarMeeting, CalendarOverlap } from '@shared/calendar-overlaps'
import { isAhead, meetingsOf, overlapsOf, normalTitle } from '@shared/calendar-overlaps'
import { parseCalendarSettings } from '@shared/calendar-parse'
import type { OverlapView, OverlapBriefOutcome } from '@shared/calendar-review'
import type { CalendarSettings } from '@shared/calendar-settings'
import type { InboxItem } from '@shared/inbox'
import { MINUTE_MS } from '@shared/time-units'

import { keepMoves, movesBetween } from './calendar-moves'
import { overlapCard, overlapNews } from './calendar-notify'
import { overlapBrief } from './calendar-overlap-brief'
import type { SourceResult } from './calendar-snapshot'
import { syncAfter, replaceCovered, isSuspiciousEmpty } from './calendar-snapshot'
import { sourceOfDraft } from './calendar-source-draft'
import type { StoredEvents, CalendarStore, StoredCalendar } from './calendar-store'
import { icsSecretKey } from './calendar-store'
import { touches, keptWindow, directWindow } from './calendar-window'

/** Сколько начал накладок впереди отдавать окну: дальше листать к ним незачем. */
const NEXT_OVERLAPS_MAX = 50

export type CalendarServiceDeps = {
  store: CalendarStore
  now: () => number
  onState: (state: CalendarState) => void
  /** Карточки календаря (накладки, напоминания) - в уведомления IDE. */
  post: (item: InboxItem) => void
  zone: () => string
}

/** Только то, что можно держать в памяти часов календаря: напоминания и утренний синк. */
export type CalendarMarks = Pick<StoredCalendar, 'reminded' | 'morningOn'>

/**
 * Календарь звонков (ADR 0114, 0116): источники, снимки их событий, настройки, объявленные и
 * просмотренные накладки, история переносов. Владелец данных - здесь; окну - состоянием после
 * каждой перемены, события и накладки - запросом. Читает источники движок синка
 * (calendar-sync.ts) и приносит прочитанное в applyRead.
 */
export class CalendarService {
  private revision = 0
  /** Непросмотренные накладки впереди: счётчик на кнопке и начала - окну листать к следующей. */
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
      seenOverlaps: Object.keys(this.calendar.seen),
      vault: this.deps.store.vault.available,
    }
  }

  get settings(): CalendarSettings {
    return this.calendar.settings
  }

  get sources(): readonly CalendarSource[] {
    return this.calendar.sources
  }

  get marks(): CalendarMarks {
    return { reminded: this.calendar.reminded, morningOn: this.calendar.morningOn }
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

  /** Накладки впереди (до конца окна прямых источников) с обеими встречами и отметкой «видел». */
  overlapsAhead(): OverlapView[] {
    const now = this.deps.now()
    const { meetings, overlaps } = this.meetingsIn(now, directWindow(now).to)
    const byKey = new Map(meetings.map((meeting) => [meeting.key, meeting]))

    return overlaps.flatMap((overlap) => {
      const a = byKey.get(overlap.a)
      const b = byKey.get(overlap.b)

      return isAhead(overlap, now) && a && b
        ? [{ ...overlap, a, b, seen: overlap.key in this.calendar.seen }]
        : []
    })
  }

  /** Отметить накладку просмотренной или снять отметку. Перенос встречи даёт новую накладку. */
  async markOverlap(key: string, seen: boolean): Promise<CalendarState> {
    const { [key]: _was, ...rest } = this.calendar.seen
    const overlap = this.overlapsAhead().find((one) => one.key === key)

    this.calendar = {
      ...this.calendar,
      seen: seen && overlap ? { ...rest, [key]: overlap.end } : rest,
    }
    this.upcoming = this.upcomingStarts()
    await this.persist()

    return this.state()
  }

  /** Разбор накладки для чата ИИ; накладки уже нет (перенесли, прошла) - отказ. */
  overlapBrief(key: string): OverlapBriefOutcome {
    const view = this.overlapsAhead().find((one) => one.key === key)

    if (!view) return { ok: false }

    const kept = keptWindow(this.deps.now())
    const repeats = ({ event, sourceIds }: CalendarMeeting) =>
      sourceIds
        .flatMap((id) => this.events.bySource[id] ?? [])
        .filter(
          (one) =>
            normalTitle(one.title) === normalTitle(event.title) &&
            Math.abs(one.start - event.start) >= MINUTE_MS &&
            touches(kept, one.start, one.end),
        )
        .map((one) => one.start)
        .sort((a, b) => a - b)

    return {
      ok: true,
      ...overlapBrief({
        view,
        sources: this.calendar.sources,
        moves: this.calendar.moves,
        repeats,
        settings: this.calendar.settings,
        zone: this.deps.zone(),
      }),
    }
  }

  /**
   * Новый источник или правка. changed - поменялось, что читается (новый, другой календарь или
   * адрес): снимок стёрт, движку пора прочитать заново.
   */
  async save(draft: CalendarSourceDraft): Promise<{ outcome: CalendarOutcome; changed: boolean }> {
    const previous = draft.id ? this.source(draft.id) : null

    if (draft.id && !previous) return { outcome: { ok: false, code: 'not-found' }, changed: false }

    const id = previous?.id ?? randomUUID()
    const result = await sourceOfDraft(draft, previous, id, this.deps.store.vault)

    if (!result.ok) return { outcome: result, changed: false }

    const { source, changed } = result

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

  /** Отметки часов календаря (напоминания, утренний синк): на диск, окну они не нужны. */
  async setMarks(marks: Partial<CalendarMarks>): Promise<void> {
    this.calendar = { ...this.calendar, ...marks }
    await this.deps.store.writeCalendar(this.calendar)
  }

  /** Фаза синка источника (очередь, идёт); null - стоит. Окну - сразу. */
  setPhase(id: string, phase: 'queued' | 'running' | null): void {
    if (phase) this.phases.set(id, phase)
    else this.phases.delete(id)

    this.deps.onState(this.state())
  }

  /** Прочитанное источником: переносы, новый снимок, синк, накладки - и окну. */
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
    // Пустой подозрительный ответ ИИ - не повод записать все встречи удалёнными.
    const moves =
      result.ok && !warned
        ? movesBetween({
            previous,
            next: snapshot,
            covered: result.covered,
            now,
            byTitle: isAiSourceKind(source.kind),
            clashed: this.clashedAt(now),
          })
        : []

    this.calendar = {
      ...this.calendar,
      sync: {
        ...this.calendar.sync,
        [id]: syncAfter(this.calendar.sync[id] ?? IDLE_SYNC, result, snapshot, warned, now),
      },
      moves: moves.length ? keepMoves(this.calendar.moves, moves, now) : this.calendar.moves,
    }

    if (result.ok) await this.replaceEvents(id, snapshot)

    this.announce(now)
    await this.persist()
  }

  /** Стояло ли событие в накладке до этого чтения: встреча его источника, то же время и название. */
  private clashedAt(now: number): (event: CalendarEvent) => boolean {
    const clashing = this.overlapsAhead()
      .filter((view) => view.end > now)
      .flatMap((view) => [view.a, view.b])

    return (event) =>
      clashing.some(
        (meeting) =>
          meeting.sourceIds.includes(event.sourceId) &&
          Math.abs(meeting.event.start - event.start) < MINUTE_MS &&
          normalTitle(meeting.event.title) === normalTitle(event.title),
      )
  }

  /** Начала непросмотренных накладок впереди, по порядку. */
  private upcomingStarts(): number[] {
    return this.overlapsAhead()
      .filter((view) => !view.seen)
      .map((view) => view.start)
      .sort((a, b) => a - b)
  }

  /**
   * Новые накладки - одной карточкой, если человек их хочет; объявленные запоминаются, отметки
   * «видел» у прошедших забываются.
   */
  private announce(now: number): void {
    const ahead = this.overlapsAhead()
    const { fresh, notified } = overlapNews(ahead, this.calendar.notified, now)
    const seen = Object.fromEntries(
      Object.entries(this.calendar.seen).filter(([, end]) => end > now),
    )

    this.calendar = { ...this.calendar, notified, seen }
    this.upcoming = this.upcomingStarts()

    if (fresh.length && this.calendar.settings.notifyOverlaps) {
      this.deps.post(overlapCard(fresh, this.calendar.sources))
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
