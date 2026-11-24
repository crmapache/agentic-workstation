import type { EventPerson, CalendarSourceView } from '@shared/calendar'
import { isAiSourceKind } from '@shared/calendar'
import type { CalendarMeeting } from '@shared/calendar-overlaps'
import { DAY_MS } from '@shared/time-units'
import { offsetAt } from '@shared/zone-time'

import { stringArg, booleanArg, ArgumentError } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { CalendarPort, WorkstationPorts } from '../../../workstation/workstation-link'

/** Период за раз: дальше двух месяцев календарь всё равно не читает. */
const SPAN_MAX = 62 * DAY_MS

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const calendarOf = (ports: WorkstationPorts): CalendarPort => {
  const calendar = ports.calendar()

  if (!calendar) throw new ArgumentError('The calendar is starting. Try again in a moment.')

  return calendar
}

/** Время этого компьютера со смещением: «2026-11-24T09:30-06:00». */
const localIso = (ms: number): string => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}${offsetAt(date, zone)}`
}

/** Граница периода: дата - местная полночь, время - как есть; нет - fallback. */
const momentArg = (args: Record<string, unknown>, key: string, fallback: number): number => {
  const value = stringArg(args, key)

  if (!value) return fallback

  const [year = 0, month = 1, day = 1] = value.split('-').map(Number)
  const ms = DATE_ONLY.test(value) ? new Date(year, month - 1, day).getTime() : Date.parse(value)

  if (Number.isNaN(ms)) throw new ArgumentError(`"${key}" must be YYYY-MM-DD or an ISO date-time.`)

  return ms
}

const periodOf = (args: Record<string, unknown>, days: number) => {
  const today = new Date()
  const from = momentArg(
    args,
    'from',
    new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime(),
  )
  const to = momentArg(args, 'to', from + days * DAY_MS)

  if (to <= from || to - from > SPAN_MAX) {
    throw new ArgumentError('"to" must be after "from", at most 62 days later.')
  }

  return { from, to }
}

const names = (sources: readonly CalendarSourceView[], ids: readonly string[]) =>
  ids.map((id) => sources.find((source) => source.id === id)?.name ?? id)

const personView = (person: EventPerson) => ({
  name: person.name,
  email: person.email,
  url: person.url,
})

const meetingView = (meeting: CalendarMeeting, sources: readonly CalendarSourceView[]) => {
  const { event } = meeting

  return {
    title: event.title || '(No title)',
    start: event.allDay ? event.allDay.from : localIso(event.start),
    end: event.allDay ? event.allDay.to : localIso(event.end),
    all_day: event.allDay !== null,
    calendars: names(sources, meeting.sourceIds),
    status: event.status,
    show_as: event.busy,
    my_response: event.response,
    join_url: event.joinUrl,
    location: event.location,
    location_url: event.locationUrl,
    format: event.format,
    organizer: event.organizer ? personView(event.organizer) : null,
    guests: event.attendees.map(personView),
    event_url: event.link,
    links: event.links,
  }
}

/** Источники словами модели: что это и когда читалось. */
const sourcesView = (sources: readonly CalendarSourceView[]) =>
  sources.map((source) => ({
    name: source.name,
    kind: source.kind,
    read_by_ai: isAiSourceKind(source.kind),
    last_synced: source.sync.lastOkAt ? localIso(source.sync.lastOkAt) : null,
    problem: source.sync.failure,
    syncing: source.sync.phase !== 'idle',
  }))

/**
 * Календарь звонков человека (ADR 0114) для ИИ в разговорах: звонки и накладки из всех его
 * источников и синк. Чтение ИИ по экрану отсюда не запускается: оно забирает мышь.
 */
export const CALENDAR_TOOLS: NativeTool<WorkstationPorts>[] = [
  {
    name: 'calendar_events',
    description:
      "The user's calls and meetings from all their calendar sources (Google, ICS, work calendars read by AI) in a period, duplicates merged, with overlap marks, and when each source was last synced. Times are local to this computer.",
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD or ISO date-time; default today' },
        to: { type: 'string', description: 'Default: 7 days after from; at most 62 days' },
      },
    },
    run: (args, ports) =>
      Promise.resolve().then(() => {
        const calendar = calendarOf(ports)
        const { from, to } = periodOf(args, 7)
        const { meetings, overlaps } = calendar.meetingsIn(from, to)
        const sources = calendar.state().sources
        const clashing = new Set(overlaps.flatMap((overlap) => [overlap.a, overlap.b]))

        return {
          sources: sourcesView(sources),
          events: meetings.map((meeting) => ({
            ...meetingView(meeting, sources),
            overlaps_another: clashing.has(meeting.key),
          })),
        }
      }),
  },
  {
    name: 'calendar_conflicts',
    description:
      "Overlapping calls in a period: pairs of meetings that take the same time, with the shared span. Back-to-back meetings, all-day events, declined and free events do not count; soft means one of them is tentative; seen_by_user means the user marked it as seen and keeps both. Each calendar is a separate job or part of life: never mention one calendar's meeting to the people of another.",
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD or ISO date-time; default today' },
        to: { type: 'string', description: 'Default: 14 days after from; at most 62 days' },
      },
    },
    run: (args, ports) =>
      Promise.resolve().then(() => {
        const calendar = calendarOf(ports)
        const { from, to } = periodOf(args, 14)
        const { meetings, overlaps } = calendar.meetingsIn(from, to)
        const byKey = new Map(meetings.map((meeting) => [meeting.key, meeting]))
        const { sources, seenOverlaps } = calendar.state()
        const view = (key: string) => {
          const meeting = byKey.get(key)

          return meeting ? meetingView(meeting, sources) : null
        }

        return overlaps.map((overlap) => ({
          start: localIso(overlap.start),
          end: localIso(overlap.end),
          soft: overlap.soft,
          seen_by_user: seenOverlaps.includes(overlap.key),
          first: view(overlap.a),
          second: view(overlap.b),
        }))
      }),
  },
  {
    name: 'calendar_sync',
    description:
      'Refresh the call calendar from its sources now. Google and ICS sources sync in seconds; include_ai also starts the sources read by AI in the browser (minutes, uses tokens, opens a tab in Chrome) - only when the user asked. Sources read on the screen sync only from the Calendar view.',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: { include_ai: { type: 'boolean', description: 'Default false' } },
    },
    run: (args, ports) =>
      Promise.resolve().then(() => {
        const calendar = calendarOf(ports)
        const started = calendar.sync(booleanArg(args, 'include_ai', false))

        return { started, note: 'Read calendar_events again in a minute.' }
      }),
  },
]
