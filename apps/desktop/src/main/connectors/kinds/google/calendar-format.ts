import { ArgumentError } from '../native-tools'

/** Время события в ответе Calendar API: весь день - date, иначе dateTime. */
export type EventTime = { date?: string; dateTime?: string; timeZone?: string }

export type CalendarEvent = {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  start?: EventTime
  end?: EventTime
  htmlLink?: string
  organizer?: { email?: string; self?: boolean }
  attendees?: { email?: string; responseStatus?: string; self?: boolean; organizer?: boolean }[]
  hangoutLink?: string
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/

const HAS_OFFSET = /(Z|[+-]\d{2}:\d{2})$/

const HAS_SECONDS = /T\d{2}:\d{2}:\d{2}/

/** Сколько описания события отдавать модели. */
const DESCRIPTION_LIMIT = 4000

/** Смещение пояса в момент: «-06:00». Правила поясов и летнего времени знает Intl. */
const offsetAt = (moment: Date, timeZone: string): string => {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(moment)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT'
  const offset = name.replace('GMT', '')

  return offset === '' ? '+00:00' : offset
}

const minutesOf = (offset: string): number => {
  const sign = offset.startsWith('-') ? -1 : 1
  const [hours = 0, minutes = 0] = offset.slice(1).split(':').map(Number)

  return sign * (hours * 60 + minutes)
}

/**
 * Смещение пояса на местную полночь даты. Сначала по полудню UTC, потом уточняется на
 * самой полуночи: в день перехода на летнее время они разные.
 */
export const zoneOffset = (date: string, timeZone: string): string => {
  const guess = offsetAt(new Date(`${date}T12:00:00Z`), timeZone)
  const midnight = new Date(Date.parse(`${date}T00:00:00Z`) - minutesOf(guess) * 60_000)

  return offsetAt(midnight, timeZone)
}

/** Секунды, если их нет: RFC 3339 их требует, а модель пишет «09:00». */
const withSeconds = (value: string): string =>
  HAS_SECONDS.test(value) ? value : value.replace(/T(\d{2}:\d{2})/, 'T$1:00')

/**
 * Время для создания события: «2026-10-25» - весь день, «2026-10-25T09:00» - время в поясе
 * timeZone (аргумент модели или пояс календаря), со смещением - как есть.
 */
export const eventTime = (value: string, timeZone: string): EventTime => {
  if (DATE_ONLY.test(value)) return { date: value }

  if (!DATE_TIME.test(value)) {
    throw new ArgumentError(`"${value}" is not a date (YYYY-MM-DD) or date-time (RFC 3339)`)
  }

  return { dateTime: withSeconds(value), timeZone }
}

/** Нужен ли пояс календаря, чтобы понять это время: даты и время без смещения - нужен. */
export const needsZone = (value: string | undefined): boolean =>
  value !== undefined && !HAS_OFFSET.test(value)

/**
 * Граница поиска событий для Google (он требует смещение). Дата без времени - местная
 * полночь в поясе календаря, а не UTC: «что у меня 25-го» в UTC-6 иначе съехало бы на
 * вечер 24-го. Время без смещения - тоже в поясе календаря.
 */
export const boundary = (value: string, timeZone: string): string => {
  if (DATE_ONLY.test(value)) return `${value}T00:00:00${zoneOffset(value, timeZone)}`

  const match = DATE_TIME.exec(value)

  if (!match?.[1]) {
    throw new ArgumentError(`"${value}" is not a date (YYYY-MM-DD) or date-time (RFC 3339)`)
  }

  return HAS_OFFSET.test(value) ? value : `${withSeconds(value)}${zoneOffset(match[1], timeZone)}`
}

const timeOf = (time: EventTime | undefined): string | null => time?.dateTime ?? time?.date ?? null

/** Событие для модели: коротко в списке, с гостями и описанием - по запросу. */
export const eventView = (event: CalendarEvent, detailed: boolean) => ({
  event_id: event.id,
  summary: event.summary ?? '(no title)',
  start: timeOf(event.start),
  end: timeOf(event.end),
  all_day: Boolean(event.start?.date),
  location: event.location ?? null,
  status: event.status ?? null,
  organizer: event.organizer?.email ?? null,
  my_response: event.attendees?.find((attendee) => attendee.self)?.responseStatus ?? null,
  guests: event.attendees?.length ?? 0,
  ...(detailed
    ? {
        description: (event.description ?? '').slice(0, DESCRIPTION_LIMIT),
        attendees: (event.attendees ?? []).map((attendee) => ({
          email: attendee.email ?? '',
          response: attendee.responseStatus ?? null,
          organizer: attendee.organizer ?? false,
        })),
        meet_link: event.hangoutLink ?? null,
        link: event.htmlLink ?? null,
      }
    : {}),
})
