import { createHash } from 'node:crypto'

import { z } from 'zod'

import type {
  EventBusy,
  EventFormat,
  EventStatus,
  CalendarEvent,
  EventResponse,
} from '@shared/calendar'
import { normalTitle } from '@shared/calendar-overlaps'
import { DAY_MS, MINUTE_MS } from '@shared/time-units'
import { isTimeZone, wallTimeToUtc } from '@shared/zone-time'

import type { SourceResult } from '../calendar-snapshot'
import type { SyncWindow } from '../calendar-window'
import { eventKey, allDayRange } from '../calendar-window'
import { eventFormatOf } from '../sources/event-format'
import { linksOf, peopleOf, personOf } from '../sources/event-links'
import { httpsUrl } from '../sources/join-url'

/** Событий от ИИ за раз: больше за восемь недель не бывает, а лишнее - мусор страницы. */
const EVENTS_MAX = 500

const TITLE_MAX = 200

const FIELD_MAX = 300

/** Плохих событий больше этой доли - ответ не принят: ИИ читал не то или выдумывал. */
const BAD_SHARE_MAX = 0.25

const DATE = /^\d{4}-\d{2}-\d{2}$/

const statusSchema = z.object({
  status: z.enum(['ok', 'partial', 'login_required', 'not_found', 'failed']),
})

const answerSchema = z.object({
  status: z.enum(['ok', 'partial', 'login_required', 'not_found', 'failed']),
  time_zone: z.string(),
  covered_from: z.string().regex(DATE),
  covered_to: z.string().regex(DATE),
  note: z.string().optional(),
  events: z.array(z.unknown()),
})

const eventSchema = z.object({
  title: z.string(),
  start: z.string(),
  end: z.string(),
  all_day: z.boolean(),
  status: z.enum(['confirmed', 'tentative', 'cancelled', 'unknown']).catch('unknown'),
  show_as: z.enum(['busy', 'free', 'tentative', 'out_of_office', 'unknown']).catch('unknown'),
  my_response: z
    .enum(['accepted', 'tentative', 'declined', 'not_responded', 'organizer', 'unknown'])
    .catch('unknown'),
  join_url: z.string().nullable().catch(null),
  location: z.string().nullable().catch(null),
  // Люди и ссылки - добавка к встрече: кривые не делают её негодной.
  location_url: z.string().nullable().catch(null),
  format: z.enum(['call', 'in_person', 'unknown']).catch('unknown'),
  organizer: z.string().nullable().catch(null),
  organizer_email: z.string().nullable().catch(null),
  organizer_url: z.string().nullable().catch(null),
  attendees: z
    .array(
      z.object({
        name: z.string().catch(''),
        email: z.string().nullable().catch(null),
        url: z.string().nullable().catch(null),
      }),
    )
    .catch([]),
  event_url: z.string().nullable().catch(null),
  links: z.array(z.object({ label: z.string().catch(''), url: z.string() })).catch([]),
})

type AiEvent = z.infer<typeof eventSchema>

const BUSY: Record<AiEvent['show_as'], EventBusy> = {
  busy: 'busy',
  free: 'free',
  tentative: 'tentative',
  out_of_office: 'away',
  unknown: 'busy',
}

const RESPONSE: Record<AiEvent['my_response'], EventResponse> = {
  accepted: 'accepted',
  tentative: 'tentative',
  declined: 'declined',
  not_responded: 'pending',
  organizer: 'organizer',
  unknown: 'unknown',
}

const FORMAT: Record<AiEvent['format'], EventFormat> = {
  call: 'call',
  in_person: 'in-person',
  unknown: 'unknown',
}

const STATUS: Record<AiEvent['status'], EventStatus> = {
  confirmed: 'confirmed',
  tentative: 'tentative',
  cancelled: 'cancelled',
  unknown: 'confirmed',
}

const clean = (value: string | null, max = FIELD_MAX): string | null =>
  value?.trim().slice(0, max) || null

/** UID события, которого у страницы нет: название и минута начала - одинаковы между синками. */
const uidOf = (title: string, start: number): string =>
  `ai:${createHash('sha256')
    .update(`${normalTitle(title)}@${Math.floor(start / MINUTE_MS)}`)
    .digest('hex')
    .slice(0, 24)}`

/** Одно событие ИИ - нашей формой; негодное (время не время, конец раньше начала) - null. */
const eventOf = (raw: unknown, sourceId: string, zone: string): CalendarEvent | null => {
  const parsed = eventSchema.safeParse(raw)

  if (!parsed.success) return null

  const event = parsed.data
  const title = event.title.trim().slice(0, TITLE_MAX)
  const allDay =
    event.all_day && DATE.test(event.start)
      ? allDayRange(event.start, DATE.test(event.end) ? event.end : null)
      : null
  const start = allDay ? Date.parse(`${allDay.from}T00:00:00Z`) : wallTimeToUtc(event.start, zone)
  const end = allDay ? Date.parse(`${allDay.to}T00:00:00Z`) : wallTimeToUtc(event.end, zone)

  if (event.all_day !== (allDay !== null) || start === null || end === null || end < start)
    return null

  const uid = uidOf(title, start)
  const joinUrl = httpsUrl(event.join_url)
  const link = httpsUrl(event.event_url)
  const locationUrl = httpsUrl(event.location_url)
  const organizer = personOf(event.organizer, event.organizer_email, event.organizer_url)
  const location = clean(event.location)

  return {
    key: eventKey(sourceId, uid, ''),
    sourceId,
    uid,
    title,
    start,
    end,
    allDay,
    status: STATUS[event.status],
    busy: BUSY[event.show_as],
    response: RESPONSE[event.my_response],
    joinUrl,
    location,
    locationUrl,
    format: eventFormatOf(joinUrl, location, FORMAT[event.format]),
    organizer,
    attendees: peopleOf(
      event.attendees
        .map((one) => personOf(one.name, one.email, one.url))
        .filter((one) => !organizer?.email || one?.email !== organizer.email),
    ),
    link,
    links: linksOf(event.links, [], [joinUrl, link, locationUrl]),
  }
}

/**
 * Ответ ИИ - прочитанным источником: события и окно, которое ИИ видел целиком (в пределах
 * спрошенного). Отказ страницы (вход, нет календаря) - причиной; ответ, где много мусора, неверный
 * пояс или пустое окно, - не принят.
 */
export const parseCalendarAnswer = (
  output: unknown,
  sourceId: string,
  asked: SyncWindow,
): SourceResult => {
  // Отказ страницы - раньше проверки дат: «нужен вход» приходит и без прочитанных дней.
  const status = statusSchema.safeParse(output)

  if (status.success && status.data.status === 'login_required') {
    return { ok: false, failure: 'login-required' }
  }
  if (status.success && status.data.status === 'not_found')
    return { ok: false, failure: 'not-found' }
  if (status.success && status.data.status === 'failed') return { ok: false, failure: 'ai-failed' }

  const parsed = answerSchema.safeParse(output)

  if (!parsed.success) return { ok: false, failure: 'ai-invalid' }

  const answer = parsed.data
  if (!isTimeZone(answer.time_zone)) return { ok: false, failure: 'ai-invalid' }

  const from = wallTimeToUtc(answer.covered_from, answer.time_zone)
  const toDay = wallTimeToUtc(answer.covered_to, answer.time_zone)
  const covered = {
    from: Math.max(from ?? Number.NaN, asked.from),
    to: Math.min((toDay ?? Number.NaN) + DAY_MS, asked.to),
  }

  if (!(covered.to > covered.from)) return { ok: false, failure: 'ai-invalid' }

  const raw = answer.events.slice(0, EVENTS_MAX)
  const events = raw.map((one) => eventOf(one, sourceId, answer.time_zone))
  const good = events.filter((event) => event !== null)

  if (raw.length > 0 && (raw.length - good.length) / raw.length > BAD_SHARE_MAX) {
    return { ok: false, failure: 'ai-invalid' }
  }

  const unique = [...new Map(good.map((event) => [event.key, event])).values()]

  return { ok: true, events: unique, covered, byAi: true }
}
