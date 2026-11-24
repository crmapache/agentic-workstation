import type {
  EventBusy,
  EventStatus,
  CalendarEvent,
  EventResponse,
  CalendarFailure,
  GoogleCalendarsOutcome,
} from '@shared/calendar'

import type { SyncWindow } from '../calendar-window'
import { eventKey, allDayRange } from '../calendar-window'
import { SignedOutError } from '../../connectors/connector-source'
import type { GoogleRequest } from '../../connectors/kinds/google/google-session'
import {
  GoogleApiError,
  GoogleAppMissingError,
  GoogleAppRejectedError,
} from '../../connectors/kinds/google/google-session'
import { CALENDAR_API } from '../../connectors/kinds/google/google.constants'
import { eventFormatOf } from './event-format'
import { linksOf, peopleOf, personOf, locationUrlOf } from './event-links'
import type { SourceRead } from './ics-source'
import { httpsUrl, joinUrlIn } from './join-url'

/** Запрос к API от имени аккаунта коннектора (GoogleSession.request). */
export type GoogleFetch = <T>(url: string, request?: GoogleRequest) => Promise<T>

type GoogleTime = { date?: string; dateTime?: string }

type GoogleEvent = {
  id: string
  iCalUID?: string
  status?: string
  summary?: string
  location?: string
  description?: string
  start?: GoogleTime
  end?: GoogleTime
  htmlLink?: string
  organizer?: { email?: string; displayName?: string; self?: boolean }
  attendees?: {
    email?: string
    displayName?: string
    responseStatus?: string
    self?: boolean
    organizer?: boolean
  }[]
  attachments?: { fileUrl?: string; title?: string }[]
  hangoutLink?: string
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }
  transparency?: string
  eventType?: string
  originalStartTime?: GoogleTime
}

type EventsPage = { items?: GoogleEvent[]; nextPageToken?: string }

/** Только нужные поля: описание - ради ссылок на звонок и документы в нём, остальное - на карточку. */
const EVENT_FIELDS =
  'nextPageToken,items(id,iCalUID,status,summary,location,description,start,end,htmlLink,' +
  'organizer(email,displayName,self),attendees(email,displayName,responseStatus,self,organizer),' +
  'attachments(fileUrl,title),hangoutLink,conferenceData(entryPoints(entryPointType,uri)),' +
  'transparency,eventType,originalStartTime)'

/** Страниц на календарь: 2500 событий на страницу, за три месяца столько не бывает. */
const PAGES_MAX = 10

const statusOf = (event: GoogleEvent): EventStatus => {
  if (event.status === 'cancelled') return 'cancelled'

  return event.status === 'tentative' ? 'tentative' : 'confirmed'
}

const busyOf = (event: GoogleEvent): EventBusy => {
  if (event.eventType === 'outOfOffice') return 'away'

  return event.transparency === 'transparent' ? 'free' : 'busy'
}

const responseOf = (event: GoogleEvent): EventResponse => {
  const mine = event.attendees?.find((attendee) => attendee.self)?.responseStatus

  switch (mine) {
    case 'accepted':
      return event.organizer?.self ? 'organizer' : 'accepted'
    case 'tentative':
      return 'tentative'
    case 'declined':
      return 'declined'
    case 'needsAction':
      return 'pending'
    default:
      return event.organizer?.self ? 'organizer' : 'unknown'
  }
}

const videoLink = (event: GoogleEvent): string | null =>
  event.conferenceData?.entryPoints?.find((point) => point.entryPointType === 'video')?.uri ??
  event.hangoutLink ??
  null

/** Событие Google - нашей формой; рабочее место («работаю из дома») - не событие. */
export const googleEventOf = (
  sourceId: string,
  calendarId: string,
  event: GoogleEvent,
): CalendarEvent | null => {
  if (event.eventType === 'workingLocation') return null

  const allDay = event.start?.date ? allDayRange(event.start.date, event.end?.date ?? null) : null
  const start = allDay
    ? Date.parse(`${allDay.from}T00:00:00Z`)
    : Date.parse(event.start?.dateTime ?? '')
  const end = allDay ? Date.parse(`${allDay.to}T00:00:00Z`) : Date.parse(event.end?.dateTime ?? '')

  if (Number.isNaN(start) || Number.isNaN(end)) return null

  const joinUrl =
    httpsUrl(videoLink(event)) ?? joinUrlIn([event.location ?? null, event.description ?? null])
  const link = httpsUrl(event.htmlLink)
  const locationUrl = locationUrlOf(event.location)

  return {
    key: eventKey(sourceId, `${calendarId}/${event.id}`, ''),
    sourceId,
    uid: event.iCalUID ?? event.id,
    title: event.summary?.trim() ?? '',
    start,
    end: Math.max(start, end),
    allDay,
    status: statusOf(event),
    busy: busyOf(event),
    response: responseOf(event),
    joinUrl,
    location: event.location?.trim() || null,
    locationUrl,
    format: eventFormatOf(joinUrl, event.location ?? null),
    organizer: personOf(event.organizer?.displayName, event.organizer?.email),
    // Я и организатор - не гости: организатор стоит своей строкой.
    attendees: peopleOf(
      (event.attendees ?? [])
        .filter((attendee) => !attendee.self && !attendee.organizer)
        .map((attendee) => personOf(attendee.displayName, attendee.email)),
    ),
    link,
    links: linksOf(
      (event.attachments ?? []).map((file) => ({ label: file.title, url: file.fileUrl })),
      [event.description],
      [joinUrl, link, locationUrl],
    ),
  }
}

const readCalendar = async (
  request: GoogleFetch,
  calendarId: string,
  sourceId: string,
  window: SyncWindow,
  signal: AbortSignal,
): Promise<CalendarEvent[]> => {
  const events: CalendarEvent[] = []
  let pageToken: string | undefined

  for (let page = 0; page < PAGES_MAX; page += 1) {
    signal.throwIfAborted()

    const answer = await request<EventsPage>(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        query: {
          timeMin: new Date(window.from).toISOString(),
          timeMax: new Date(window.to).toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '2500',
          fields: EVENT_FIELDS,
          ...(pageToken && { pageToken }),
        },
      },
    )

    for (const item of answer.items ?? []) {
      const event = googleEventOf(sourceId, calendarId, item)

      if (event) events.push(event)
    }

    pageToken = answer.nextPageToken

    if (!pageToken) break
  }

  return events
}

/** Сбой запроса к Google - кодом: вход, нет календаря, отказ API, сеть, отмена. */
const googleFailureOf = (error: unknown, signal: AbortSignal): CalendarFailure => {
  if (signal.aborted) return 'cancelled'
  // Нет клиента Google в IDE или его отозвали - чинится тем же входом на виде Connectors.
  if (
    error instanceof SignedOutError ||
    error instanceof GoogleAppMissingError ||
    error instanceof GoogleAppRejectedError
  ) {
    return 'signed-out'
  }

  console.warn('[calendar] Google не прочитался', error)

  if (error instanceof GoogleApiError) return error.status === 404 ? 'not-found' : 'http'

  return error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'network'
}

/**
 * События календарей аккаунта Google в окне; пусто в списке - основной. Повторы раскрывает
 * сам Google (singleEvents).
 */
export const readGoogle = async (
  request: GoogleFetch,
  calendarIds: readonly string[],
  sourceId: string,
  window: SyncWindow,
  signal: AbortSignal,
): Promise<SourceRead> => {
  try {
    const ids = calendarIds.length ? calendarIds : ['primary']
    const pages = await Promise.all(
      ids.map((id) => readCalendar(request, id, sourceId, window, signal)),
    )

    return { ok: true, events: pages.flat().sort((a, b) => a.start - b.start) }
  } catch (error) {
    return { ok: false, failure: googleFailureOf(error, signal) }
  }
}

type CalendarListPage = {
  items?: { id: string; summary?: string; summaryOverride?: string; primary?: boolean }[]
}

/** Календари аккаунта для формы источника: свои и те, на которые он подписан. */
export const listGoogleCalendars = async (
  request: GoogleFetch,
): Promise<GoogleCalendarsOutcome> => {
  try {
    const answer = await request<CalendarListPage>(`${CALENDAR_API}/users/me/calendarList`, {
      query: {
        minAccessRole: 'freeBusyReader',
        fields: 'items(id,summary,summaryOverride,primary)',
      },
    })

    return {
      ok: true,
      calendars: (answer.items ?? []).map((item) => ({
        id: item.id,
        name: item.summaryOverride ?? item.summary ?? item.id,
        primary: item.primary === true,
      })),
    }
  } catch (error) {
    return { ok: false, failure: googleFailureOf(error, new AbortController().signal) }
  }
}
