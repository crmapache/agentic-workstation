import { numberArg, stringArg, stringListArg } from '../native-tools'
import type { NativeTool } from '../native-tools'
import { zoneFor, eventUrl, TIME_HINT, calendarId, CALENDAR_ID } from './calendar-api'
import type { Calendar } from './calendar-api'
import { boundary, eventView } from './calendar-format'
import type { CalendarEvent } from './calendar-format'
import { CALENDAR_API } from './google.constants'

type CalendarEntry = {
  id: string
  summary?: string
  primary?: boolean
  accessRole?: string
  timeZone?: string
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Инструменты чтения Google Calendar: календари, события, занятость. */
export const CALENDAR_READ_TOOLS: NativeTool<Calendar>[] = [
  {
    name: 'list_calendars',
    access: 'read',
    description: 'List calendars with ids, names, access role and time zone.',
    inputSchema: { type: 'object', properties: {} },
    run: async (_args, calendar) => {
      const { items = [] } = await calendar.request<{ items?: CalendarEntry[] }>(
        `${CALENDAR_API}/users/me/calendarList`,
      )

      return items.map((item) => ({
        calendar_id: item.id,
        name: item.summary ?? '',
        primary: item.primary ?? false,
        access: item.accessRole ?? null,
        time_zone: item.timeZone ?? null,
      }))
    },
  },
  {
    name: 'list_events',
    access: 'read',
    description:
      'List events in a time range (default: next 7 days), recurring events expanded, ordered by start. If next_page_token is not null, there are more events - fetch the next page before concluding the time is free.',
    inputSchema: {
      type: 'object',
      properties: {
        calendar_id: CALENDAR_ID,
        time_min: { type: 'string', description: TIME_HINT },
        time_max: { type: 'string', description: TIME_HINT },
        query: { type: 'string', description: 'Free text search in events' },
        max_results: { type: 'number', description: '1-250, default 50' },
        page_token: {
          type: 'string',
          description: 'next_page_token from a previous call, with its time_min and time_max',
        },
      },
    },
    run: async (args, calendar) => {
      const min = stringArg(args, 'time_min')
      const max = stringArg(args, 'time_max')
      const zone = await zoneFor(calendar, args, [min, max])
      const timeMin = min ? boundary(min, zone) : new Date().toISOString()
      const timeMax = max ? boundary(max, zone) : new Date(Date.now() + WEEK_MS).toISOString()
      const reply = await calendar.request<{ items?: CalendarEvent[]; nextPageToken?: string }>(
        `${CALENDAR_API}/calendars/${calendarId(args)}/events`,
        {
          query: {
            timeMin,
            timeMax,
            q: stringArg(args, 'query'),
            maxResults: numberArg(args, 'max_results', { min: 1, max: 250, fallback: 50 }),
            pageToken: stringArg(args, 'page_token'),
            singleEvents: true,
            orderBy: 'startTime',
          },
        },
      )

      // Границы - явно: следующую страницу просят с теми же, иначе «сейчас» уже другое.
      return {
        events: (reply.items ?? []).map((event) => eventView(event, false)),
        time_min: timeMin,
        time_max: timeMax,
        next_page_token: reply.nextPageToken ?? null,
      }
    },
  },
  {
    name: 'get_event',
    access: 'read',
    description: 'Read one event with description, guests and their responses, Meet link.',
    inputSchema: {
      type: 'object',
      properties: { calendar_id: CALENDAR_ID, event_id: { type: 'string' } },
      required: ['event_id'],
    },
    run: async (args, calendar) =>
      eventView(await calendar.request<CalendarEvent>(eventUrl(args)), true),
  },
  {
    name: 'find_busy_times',
    access: 'read',
    description: 'Busy intervals of one or more calendars in a range - to find a free slot.',
    inputSchema: {
      type: 'object',
      properties: {
        time_min: { type: 'string', description: TIME_HINT },
        time_max: { type: 'string', description: TIME_HINT },
        calendar_ids: { type: 'array', items: { type: 'string' }, description: 'Default primary' },
      },
      required: ['time_min', 'time_max'],
    },
    run: async (args, calendar) => {
      const ids = stringListArg(args, 'calendar_ids')
      const min = stringArg(args, 'time_min', true)
      const max = stringArg(args, 'time_max', true)
      // Пояс - основного календаря: «свободен ли я завтра» спрашивают о своём дне.
      const zone = await zoneFor(calendar, {}, [min, max])
      const reply = await calendar.request<{
        calendars?: Record<string, { busy?: { start: string; end: string }[] }>
      }>(`${CALENDAR_API}/freeBusy`, {
        method: 'POST',
        body: {
          timeMin: boundary(min, zone),
          timeMax: boundary(max, zone),
          timeZone: zone,
          items: (ids.length ? ids : ['primary']).map((id) => ({ id })),
        },
      })

      return Object.fromEntries(
        Object.entries(reply.calendars ?? {}).map(([id, entry]) => [id, entry.busy ?? []]),
      )
    },
  },
]
