import { pathId, stringArg } from '../native-tools'
import { eventTime, needsZone } from './calendar-format'
import type { GoogleSession } from './google-session'
import { CALENDAR_API } from './google.constants'

export type Calendar = GoogleSession

/** Календарь из аргументов, экранированным для пути API; по умолчанию - основной. */
export const calendarId = (args: Record<string, unknown>): string =>
  pathId(stringArg(args, 'calendar_id') ?? 'primary', 'calendar_id')

export const eventUrl = (args: Record<string, unknown>): string =>
  `${CALENDAR_API}/calendars/${calendarId(args)}/events/${pathId(stringArg(args, 'event_id', true), 'event_id')}`

/** Пояс календаря: в нём понимаются даты и время, которые модель дала без смещения. */
const calendarZone = async (calendar: Calendar, id: string): Promise<string> =>
  (await calendar.request<{ timeZone?: string }>(`${CALENDAR_API}/calendars/${id}`)).timeZone ??
  'UTC'

/**
 * Пояс для этих значений: аргумент модели, а если его нет и хоть одно значение без
 * смещения - пояс календаря (лишний запрос - только тогда).
 */
export const zoneFor = async (
  calendar: Calendar,
  args: Record<string, unknown>,
  values: (string | undefined)[],
): Promise<string> =>
  stringArg(args, 'time_zone') ??
  (values.some(needsZone) ? await calendarZone(calendar, calendarId(args)) : 'UTC')

/** Поля события из аргументов: только то, что модель передала. */
export const eventFields = async (calendar: Calendar, args: Record<string, unknown>) => {
  const start = stringArg(args, 'start')
  const end = stringArg(args, 'end')
  const zone = await zoneFor(calendar, args, [start, end])

  return {
    ...(stringArg(args, 'summary') ? { summary: stringArg(args, 'summary') } : {}),
    ...(args['description'] !== undefined
      ? { description: stringArg(args, 'description') ?? '' }
      : {}),
    ...(args['location'] !== undefined ? { location: stringArg(args, 'location') ?? '' } : {}),
    ...(start ? { start: eventTime(start, zone) } : {}),
    ...(end ? { end: eventTime(end, zone) } : {}),
  }
}

export const CALENDAR_ID = {
  type: 'string',
  description: 'Calendar id from list_calendars; default "primary"',
}

/** Время для модели: смещение можно не писать - тогда это время в поясе календаря. */
export const TIME_HINT =
  'YYYY-MM-DD or RFC 3339 date-time; without an offset it is read in the calendar time zone'

export const EVENT_PROPERTIES = {
  calendar_id: CALENDAR_ID,
  summary: { type: 'string' },
  start: { type: 'string', description: `${TIME_HINT}; a date alone makes an all-day event` },
  end: { type: 'string', description: 'Same format as start; for all-day - the day after' },
  time_zone: {
    type: 'string',
    description: 'IANA zone, e.g. America/Costa_Rica; default - the calendar zone',
  },
  description: { type: 'string' },
  location: { type: 'string' },
}
