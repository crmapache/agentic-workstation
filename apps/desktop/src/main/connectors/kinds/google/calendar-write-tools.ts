import { stringArg, booleanArg, ArgumentError, stringListArg } from '../native-tools'
import type { NativeTool } from '../native-tools'
import { eventUrl, calendarId, CALENDAR_ID, eventFields, EVENT_PROPERTIES } from './calendar-api'
import type { Calendar } from './calendar-api'
import { eventView } from './calendar-format'
import type { CalendarEvent } from './calendar-format'
import { CALENDAR_API } from './google.constants'

/** Ответ на приглашение - только из этих: так их понимает Calendar API. */
const RESPONSES = ['accepted', 'declined', 'tentative']

/**
 * Инструменты записи Google Calendar. Свои события создаются и правятся без гостей и без
 * писем (sendUpdates=none). Гости и ответ на приглашение - ступень outbound: это видят
 * другие люди, по умолчанию выключено (ADR 0028).
 */
export const CALENDAR_WRITE_TOOLS: NativeTool<Calendar>[] = [
  {
    name: 'create_event',
    access: 'write',
    description: 'Create an event on your calendar without guests. Nobody is notified.',
    inputSchema: {
      type: 'object',
      properties: EVENT_PROPERTIES,
      required: ['summary', 'start', 'end'],
    },
    run: async (args, calendar) => {
      stringArg(args, 'start', true)
      stringArg(args, 'end', true)

      const event = await calendar.request<CalendarEvent>(
        `${CALENDAR_API}/calendars/${calendarId(args)}/events`,
        { method: 'POST', query: { sendUpdates: 'none' }, body: await eventFields(calendar, args) },
      )

      return eventView(event, true)
    },
  },
  {
    name: 'update_event',
    access: 'write',
    description:
      'Change title, time, description or location of an event. Guests are not notified.',
    inputSchema: {
      type: 'object',
      properties: { event_id: { type: 'string' }, ...EVENT_PROPERTIES },
      required: ['event_id'],
    },
    run: async (args, calendar) =>
      eventView(
        await calendar.request<CalendarEvent>(eventUrl(args), {
          method: 'PATCH',
          query: { sendUpdates: 'none' },
          body: await eventFields(calendar, args),
        }),
        true,
      ),
  },
  {
    name: 'delete_event',
    access: 'write',
    description: 'Delete an event. Guests are not notified.',
    inputSchema: {
      type: 'object',
      properties: { calendar_id: CALENDAR_ID, event_id: { type: 'string' } },
      required: ['event_id'],
    },
    run: async (args, calendar) => {
      await calendar.request(eventUrl(args), { method: 'DELETE', query: { sendUpdates: 'none' } })

      return { deleted: true }
    },
  },
  {
    name: 'set_event_guests',
    access: 'outbound',
    description: 'Replace the guest list of an event; with notify=true guests get an email.',
    inputSchema: {
      type: 'object',
      properties: {
        calendar_id: CALENDAR_ID,
        event_id: { type: 'string' },
        emails: { type: 'array', items: { type: 'string' } },
        notify: { type: 'boolean', description: 'Email the guests, default false' },
      },
      required: ['event_id', 'emails'],
    },
    run: async (args, calendar) =>
      eventView(
        await calendar.request<CalendarEvent>(eventUrl(args), {
          method: 'PATCH',
          query: { sendUpdates: booleanArg(args, 'notify', false) ? 'all' : 'none' },
          body: { attendees: stringListArg(args, 'emails').map((email) => ({ email })) },
        }),
        true,
      ),
  },
  {
    name: 'respond_to_event',
    access: 'outbound',
    description: 'Accept, decline or tentatively accept an invitation. The organizer sees it.',
    inputSchema: {
      type: 'object',
      properties: {
        calendar_id: CALENDAR_ID,
        event_id: { type: 'string' },
        response: { type: 'string', enum: RESPONSES },
      },
      required: ['event_id', 'response'],
    },
    run: async (args, calendar) => {
      const response = stringArg(args, 'response', true)

      if (!RESPONSES.includes(response)) {
        throw new ArgumentError(`"response" must be one of ${RESPONSES.join(', ')}`)
      }

      const event = await calendar.request<CalendarEvent>(eventUrl(args))
      const attendees = (event.attendees ?? []).map((attendee) =>
        attendee.self ? { ...attendee, responseStatus: response } : attendee,
      )

      if (!attendees.some((attendee) => attendee.self)) {
        throw new ArgumentError('You are not a guest of this event')
      }

      return eventView(
        await calendar.request<CalendarEvent>(eventUrl(args), {
          method: 'PATCH',
          query: { sendUpdates: 'all' },
          body: { attendees },
        }),
        false,
      )
    },
  },
]
