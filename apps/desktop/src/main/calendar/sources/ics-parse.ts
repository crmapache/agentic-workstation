import ICAL from 'ical.js'

import type { EventBusy, EventStatus, CalendarEvent } from '@shared/calendar'
import { DAY_MS } from '@shared/time-units'
import { isTimeZone, wallTimeToUtc } from '@shared/zone-time'

import type { SyncWindow } from '../calendar-window'
import { eventKey, allDayRange } from '../calendar-window'
import { linksOf, peopleOf, personOf, locationUrlOf } from './event-links'
import { httpsUrl, joinUrlIn } from './join-url'
import { WINDOWS_ZONES } from './windows-zones.constants'

type IcalTime = InstanceType<typeof ICAL.Time>
type IcalEvent = InstanceType<typeof ICAL.Event>
type IcalComponent = InstanceType<typeof ICAL.Component>
type IcalProperty = InstanceType<typeof ICAL.Property>

/**
 * Шагов повтора на серию: ежедневная встреча с 2010 года - около шести тысяч шагов до сегодня,
 * а правило без конца не должно крутиться вечно.
 */
const SERIES_STEPS_MAX = 20_000

/** Событий из одного файла: больше на сетке за три месяца не бывает. */
const EVENTS_MAX = 5000

/** Перенесённый повтор может прийти из-за края окна: серию читаем на месяц дальше. */
const SERIES_TAIL_MS = 31 * DAY_MS

const pad = (value: number, width = 2) => String(value).padStart(width, '0')

const dateOf = (time: IcalTime) => `${pad(time.year, 4)}-${pad(time.month)}-${pad(time.day)}`

const wallOf = (time: IcalTime) => `${dateOf(time)}T${pad(time.hour)}:${pad(time.minute)}`

const textOf = (component: IcalComponent, name: string): string => {
  const value = component.getFirstPropertyValue(name)

  return typeof value === 'string' ? value.trim() : ''
}

/** TZID свойства времени: в файле его может не быть описано (Outlook). */
const tzidOf = (component: IcalComponent, name: string): string | null => {
  const tzid = component.getFirstProperty(name)?.getParameter('tzid')

  return typeof tzid === 'string' && tzid ? tzid : null
}

/**
 * Время ICS в мс UTC. Пояс описан в файле (VTIMEZONE) или это UTC - считает ical.js. Пояс
 * назван, но не описан - по имени: IANA как есть, Windows - таблицей CLDR. Плавающее время
 * (без пояса) - на часах этого компьютера, как его показал бы любой календарь здесь.
 */
const utcOf = (time: IcalTime, tzid: string | null, machineZone: string): number => {
  const known = time.zone?.tzid

  if (known && known !== 'floating') return time.toUnixTime() * 1000

  const named = tzid && (isTimeZone(tzid) ? tzid : (WINDOWS_ZONES[tzid] ?? null))

  return wallTimeToUtc(wallOf(time), named || machineZone) ?? time.toUnixTime() * 1000
}

const statusOf = (component: IcalComponent): EventStatus => {
  const status = textOf(component, 'status').toUpperCase()

  if (status === 'CANCELLED') return 'cancelled'

  return status === 'TENTATIVE' ? 'tentative' : 'confirmed'
}

/** Занятость: поле Outlook точнее TRANSP - у него есть «под вопросом» и «нет на месте». */
const busyOf = (component: IcalComponent): EventBusy => {
  switch (textOf(component, 'x-microsoft-cdo-busystatus').toUpperCase()) {
    case 'FREE':
    case 'WORKINGELSEWHERE':
      return 'free'
    case 'TENTATIVE':
      return 'tentative'
    case 'OOF':
      return 'away'
    case 'BUSY':
      return 'busy'
    default:
      return textOf(component, 'transp').toUpperCase() === 'TRANSPARENT' ? 'free' : 'busy'
  }
}

/** Человек из свойства ORGANIZER или ATTENDEE: имя - CN, почта - адрес mailto. */
const personIn = (property: IcalProperty | null) => {
  const name = property?.getParameter('cn')
  const value = property?.getFirstValue()

  return personOf(typeof name === 'string' ? name : null, typeof value === 'string' ? value : null)
}

/** Вложения-ссылки (ATTACH с адресом, а не байтами): подпись - имя файла, если есть. */
const attachmentsOf = (component: IcalComponent) =>
  component.getAllProperties('attach').map((attach) => {
    const name = attach.getParameter('filename') ?? attach.getParameter('x-filename')
    const value = attach.getFirstValue()

    return {
      label: typeof name === 'string' ? name : null,
      url: typeof value === 'string' ? value : null,
    }
  })

type Occurrence = { start: IcalTime; end: IcalTime; item: IcalEvent; recurrenceId: string }

/** Одно событие нашей формы из повтора. */
const eventOf = (
  sourceId: string,
  master: IcalComponent,
  occurrence: Occurrence,
  machineZone: string,
): CalendarEvent => {
  const component = occurrence.item.component
  const uid = textOf(master, 'uid')
  const allDay = occurrence.start.isDate
    ? allDayRange(dateOf(occurrence.start), occurrence.end.isDate ? dateOf(occurrence.end) : null)
    : null
  const start = allDay
    ? Date.parse(`${allDay.from}T00:00:00Z`)
    : utcOf(occurrence.start, tzidOf(component, 'dtstart'), machineZone)
  const end = allDay
    ? Date.parse(`${allDay.to}T00:00:00Z`)
    : utcOf(occurrence.end, tzidOf(component, 'dtend') ?? tzidOf(component, 'dtstart'), machineZone)
  const link = httpsUrl(textOf(component, 'url'))
  const location = textOf(component, 'location')
  const joinUrl = joinUrlIn([
    textOf(component, 'x-microsoft-skypeteamsmeetingurl'),
    textOf(component, 'x-google-conference'),
    link,
    location,
    textOf(component, 'description'),
  ])
  const locationUrl = locationUrlOf(location)
  const organizer = personIn(component.getFirstProperty('organizer'))

  return {
    key: eventKey(sourceId, uid, occurrence.recurrenceId),
    sourceId,
    uid,
    title: textOf(component, 'summary'),
    start,
    end: Math.max(end, start),
    allDay,
    status: statusOf(component),
    busy: busyOf(component),
    response: 'unknown',
    joinUrl,
    location: location || null,
    locationUrl,
    organizer,
    // Организатор стоит своей строкой: у Outlook он бывает и среди гостей.
    attendees: peopleOf(
      component
        .getAllProperties('attendee')
        .map(personIn)
        .filter((person) => !organizer?.email || person?.email !== organizer.email),
    ),
    link,
    links: linksOf(
      attachmentsOf(component),
      [textOf(component, 'description')],
      [joinUrl, link, locationUrl],
    ),
  }
}

/** Повторы события, задевающие окно; у не повторяющегося - он сам. */
function* occurrencesOf(event: IcalEvent, window: SyncWindow): Generator<Occurrence> {
  if (!event.isRecurring()) {
    yield { start: event.startDate, end: event.endDate, item: event, recurrenceId: '' }

    return
  }

  const expansion = event.iterator()

  for (let step = 0; step < SERIES_STEPS_MAX; step += 1) {
    const next = expansion.next()

    if (!next || next.toUnixTime() * 1000 > window.to + SERIES_TAIL_MS) return

    const details = event.getOccurrenceDetails(next)

    yield {
      start: details.startDate,
      end: details.endDate,
      item: details.item,
      recurrenceId: details.recurrenceId.toString(),
    }
  }
}

/** Корневые VCALENDAR: в файле их бывает несколько. */
const rootsOf = (text: string): IcalComponent[] => {
  const parsed = ICAL.parse(text) as unknown[]

  return (Array.isArray(parsed[0]) ? parsed : [parsed]).map(
    (jcal) => new ICAL.Component(jcal as ConstructorParameters<typeof ICAL.Component>[0]),
  )
}

/**
 * События ICS, задевающие окно: повторы раскрыты, перенесённые и отменённые повторы - по
 * своим RECURRENCE-ID. Файл не разбирается - null.
 */
export const parseIcs = (
  text: string,
  sourceId: string,
  window: SyncWindow,
  machineZone: string,
): CalendarEvent[] | null => {
  let roots: IcalComponent[]

  try {
    roots = rootsOf(text)
  } catch {
    return null
  }

  const vevents = roots.flatMap((root) => root.getAllSubcomponents('vevent'))
  const overrides = new Map<string, IcalComponent[]>()
  const masters: IcalComponent[] = []

  for (const vevent of vevents) {
    const uid = textOf(vevent, 'uid')

    if (uid && vevent.hasProperty('recurrence-id')) {
      overrides.set(uid, [...(overrides.get(uid) ?? []), vevent])
    } else {
      masters.push(vevent)
    }
  }

  const masterUids = new Set(masters.map((master) => textOf(master, 'uid')))
  // Перенос без самой серии (Outlook отдаёт и так) - отдельное событие.
  const orphans = [...overrides.entries()]
    .filter(([uid]) => !masterUids.has(uid))
    .flatMap(([, components]) => components)
  const events: CalendarEvent[] = []

  for (const master of [...masters, ...orphans]) {
    const event = new ICAL.Event(master, {
      exceptions: orphans.includes(master) ? [] : (overrides.get(textOf(master, 'uid')) ?? []),
      strictExceptions: false,
    })

    for (const occurrence of occurrencesOf(event, window)) {
      const found = eventOf(sourceId, master, occurrence, machineZone)

      if (found.end > window.from - DAY_MS && found.start < window.to + DAY_MS) events.push(found)
      if (events.length >= EVENTS_MAX) return events
    }
  }

  return events.sort((a, b) => a.start - b.start)
}
