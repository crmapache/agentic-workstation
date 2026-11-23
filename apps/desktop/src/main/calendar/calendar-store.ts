import { join } from 'node:path'

import type { SourceSync, CalendarEvent, CalendarSource, CalendarSettings } from '@shared/calendar'
import { IDLE_SYNC, CALENDAR_FAILURES, DEFAULT_CALENDAR_SETTINGS } from '@shared/calendar'
import { parseStoredSource, parseCalendarSettings } from '@shared/calendar-parse'

import { JsonFile } from '../storage/json-file'
import type { Vault } from '../storage/vault'

/** Источники, их синк, настройки и уже объявленные накладки. */
export type StoredCalendar = {
  version: 1
  sources: CalendarSource[]
  sync: Record<string, SourceSync>
  settings: CalendarSettings
  /** Ключ накладки → конец её общего отрезка: объявленные один раз, забываются после конца. */
  notified: Record<string, number>
}

/** Снимки событий по источникам: пишутся часто и бывают большими - отдельным файлом. */
export type StoredEvents = { version: 1; bySource: Record<string, CalendarEvent[]> }

const EMPTY_CALENDAR: StoredCalendar = {
  version: 1,
  sources: [],
  sync: {},
  settings: DEFAULT_CALENDAR_SETTINGS,
  notified: {},
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/** Синк с диска: фаза всегда «стоит» - процессы синка не переживают перезапуск IDE. */
const syncOf = (value: unknown): SourceSync => {
  if (!isRecord(value)) return IDLE_SYNC

  const covered = isRecord(value['covered']) ? value['covered'] : null
  const from = numberOrNull(covered?.['from'])
  const to = numberOrNull(covered?.['to'])

  return {
    ...IDLE_SYNC,
    lastOkAt: numberOrNull(value['lastOkAt']),
    lastTriedAt: numberOrNull(value['lastTriedAt']),
    covered: from !== null && to !== null && to > from ? { from, to } : null,
    failure: CALENDAR_FAILURES.find((failure) => failure === value['failure']) ?? null,
    warning: value['warning'] === 'suspicious-empty' ? 'suspicious-empty' : null,
    count: numberOrNull(value['count']) ?? 0,
  }
}

export const parseStoredCalendar = (value: unknown): StoredCalendar => {
  if (!isRecord(value)) return EMPTY_CALENDAR

  const sources = (Array.isArray(value['sources']) ? value['sources'] : [])
    .map(parseStoredSource)
    .filter((source) => source !== null)
  const sync = isRecord(value['sync']) ? value['sync'] : {}
  const notified = isRecord(value['notified']) ? value['notified'] : {}

  return {
    version: 1,
    sources,
    sync: Object.fromEntries(sources.map((source) => [source.id, syncOf(sync[source.id])])),
    settings: parseCalendarSettings(value['settings']),
    notified: Object.fromEntries(
      Object.entries(notified).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number',
      ),
    ),
  }
}

/**
 * События с диска: их писала сама IDE, поэтому проверка лёгкая - только форма, без которой
 * сетка упала бы. Снимок источника, которого больше нет, выпадает.
 */
export const parseStoredEvents = (value: unknown, sourceIds: readonly string[]): StoredEvents => {
  const bySource = isRecord(value) && isRecord(value['bySource']) ? value['bySource'] : {}

  return {
    version: 1,
    bySource: Object.fromEntries(
      sourceIds.map((id) => {
        const events = bySource[id]

        return [
          id,
          Array.isArray(events)
            ? events.filter(
                (event): event is CalendarEvent =>
                  isRecord(event) &&
                  typeof event['key'] === 'string' &&
                  typeof event['start'] === 'number' &&
                  typeof event['end'] === 'number',
              )
            : [],
        ]
      }),
    ),
  }
}

/** Ключ полной ссылки ICS в хранилище секретов календаря. */
export const icsSecretKey = (sourceId: string): string => `ics:${sourceId}`

/**
 * Файлы календаря в данных IDE: `calendar.json` и `calendar-events.json` (права 600: в событиях
 * чужие имена и ссылки на звонки), ссылки ICS - в своём `calendar.vault`. Записи каждого файла -
 * по очереди: две подряд писали бы один временный файл разом.
 */
export class CalendarStore {
  private writingCalendar: Promise<void> = Promise.resolve()
  private writingEvents: Promise<void> = Promise.resolve()

  constructor(
    private readonly calendarFile: JsonFile<StoredCalendar>,
    private readonly eventsFile: JsonFile<StoredEvents>,
    readonly vault: Vault,
  ) {}

  static inDir(dataDir: string, vault: Vault): CalendarStore {
    return new CalendarStore(
      new JsonFile(join(dataDir, 'calendar.json'), { mode: 0o600 }),
      new JsonFile(join(dataDir, 'calendar-events.json'), { mode: 0o600 }),
      vault,
    )
  }

  async load(): Promise<{ calendar: StoredCalendar; events: StoredEvents }> {
    const calendar = parseStoredCalendar(await this.calendarFile.read())
    const events = parseStoredEvents(
      await this.eventsFile.read(),
      calendar.sources.map((source) => source.id),
    )

    return { calendar, events }
  }

  writeCalendar(value: StoredCalendar): Promise<void> {
    this.writingCalendar = this.writingCalendar
      .catch(() => undefined)
      .then(() => this.calendarFile.write(value))

    return this.writingCalendar
  }

  writeEvents(value: StoredEvents): Promise<void> {
    this.writingEvents = this.writingEvents
      .catch(() => undefined)
      .then(() => this.eventsFile.write(value))

    return this.writingEvents
  }
}
