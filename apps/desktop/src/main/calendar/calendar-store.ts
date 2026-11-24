import { join } from 'node:path'

import type { SourceSync, EventPerson, CalendarEvent, CalendarSource } from '@shared/calendar'
import { IDLE_SYNC, isEventFormat, CALENDAR_FAILURES } from '@shared/calendar'
import { parseStoredSource, parseCalendarSettings } from '@shared/calendar-parse'
import type { MoveRecord } from '@shared/calendar-review'
import type { CalendarSettings } from '@shared/calendar-settings'
import { DEFAULT_CALENDAR_SETTINGS } from '@shared/calendar-settings'

import { JsonFile } from '../storage/json-file'
import type { Vault } from '../storage/vault'
import { eventFormatOf } from './sources/event-format'

/** Источники, их синк, настройки и уже объявленные накладки. */
export type StoredCalendar = {
  version: 1
  sources: CalendarSource[]
  sync: Record<string, SourceSync>
  settings: CalendarSettings
  /** Ключ накладки → конец её общего отрезка: объявленные один раз, забываются после конца. */
  notified: Record<string, number>
  /** Накладки, отмеченные «видел»: ключ → конец общего отрезка, прошедшие забываются. */
  seen: Record<string, number>
  /** Переносы встреч, замеченные синком, новые первыми: история для разбора накладок. */
  moves: MoveRecord[]
  /** Напоминание о звонке уже было: ключ (встреча, начало, минуты) → начало встречи. */
  reminded: Record<string, number>
  /** День (ГГГГ-ММ-ДД), когда утренний синк уже прошёл; пусто - ещё не было. */
  morningOn: string
}

/** Снимки событий по источникам: пишутся часто и бывают большими - отдельным файлом. */
export type StoredEvents = { version: 1; bySource: Record<string, CalendarEvent[]> }

const EMPTY_CALENDAR: StoredCalendar = {
  version: 1,
  sources: [],
  sync: {},
  settings: DEFAULT_CALENDAR_SETTINGS,
  notified: {},
  seen: {},
  moves: [],
  reminded: {},
  morningOn: '',
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

/** Словарь «ключ → число» с диска: чужие значения выпадают. */
const numbersOf = (value: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries(isRecord(value) ? value : {}).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  )

const MOVE_KINDS: readonly MoveRecord['kind'][] = ['moved', 'declined', 'cancelled', 'removed']

const moveOf = (value: unknown): MoveRecord | null => {
  if (!isRecord(value)) return null

  const at = numberOrNull(value['at'])
  const from = numberOrNull(value['from'])
  const kind = MOVE_KINDS.find((one) => one === value['kind'])

  return at !== null && from !== null && kind && typeof value['sourceId'] === 'string'
    ? {
        at,
        sourceId: value['sourceId'],
        title: typeof value['title'] === 'string' ? value['title'] : '',
        organizer: typeof value['organizer'] === 'string' ? value['organizer'] : null,
        from,
        to: numberOrNull(value['to']),
        kind,
        clashed: value['clashed'] === true,
      }
    : null
}

export const parseStoredCalendar = (value: unknown): StoredCalendar => {
  if (!isRecord(value)) return EMPTY_CALENDAR

  const sources = (Array.isArray(value['sources']) ? value['sources'] : [])
    .map(parseStoredSource)
    .filter((source) => source !== null)
  const sync = isRecord(value['sync']) ? value['sync'] : {}

  return {
    version: 1,
    sources,
    sync: Object.fromEntries(sources.map((source) => [source.id, syncOf(sync[source.id])])),
    settings: parseCalendarSettings(value['settings']),
    notified: numbersOf(value['notified']),
    seen: numbersOf(value['seen']),
    moves: (Array.isArray(value['moves']) ? value['moves'] : [])
      .map(moveOf)
      .filter((move) => move !== null),
    reminded: numbersOf(value['reminded']),
    morningOn: typeof value['morningOn'] === 'string' ? value['morningOn'] : '',
  }
}

const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** Человек встречи с диска; до ADR 0116 организатор был строкой - она и есть имя. */
const personOf = (value: unknown): EventPerson | null => {
  if (typeof value === 'string') return value ? { name: value, email: null, url: null } : null
  if (!isRecord(value) || typeof value['name'] !== 'string') return null

  return { name: value['name'], email: textOrNull(value['email']), url: textOrNull(value['url']) }
}

/**
 * Событие с диска: форма, без которой сетка упала бы, и поля, которых не было у старых
 * снимков (люди и ссылки, ADR 0116), - пустыми, а звонок-или-лично - по полям события.
 */
const storedEventOf = (value: unknown): CalendarEvent | null => {
  if (
    !isRecord(value) ||
    typeof value['key'] !== 'string' ||
    typeof value['start'] !== 'number' ||
    typeof value['end'] !== 'number'
  ) {
    return null
  }

  const event = value as unknown as CalendarEvent
  const attendees = Array.isArray(value['attendees']) ? value['attendees'] : []
  const links = Array.isArray(value['links']) ? value['links'] : []

  return {
    ...event,
    locationUrl: textOrNull(value['locationUrl']),
    // До звонка-или-лично снимки его не несли: решается по ссылке и месту, ИИ уточнит на синке.
    format: isEventFormat(value['format'])
      ? value['format']
      : eventFormatOf(textOrNull(value['joinUrl']), textOrNull(value['location'])),
    organizer: personOf(value['organizer']),
    attendees: attendees.map(personOf).filter((person) => person !== null),
    links: links.filter(
      (link): link is CalendarEvent['links'][number] =>
        isRecord(link) && typeof link['label'] === 'string' && typeof link['url'] === 'string',
    ),
  }
}

/**
 * События с диска: их писала сама IDE, поэтому проверка лёгкая. Снимок источника, которого
 * больше нет, выпадает.
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
          Array.isArray(events) ? events.map(storedEventOf).filter((event) => event !== null) : [],
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
