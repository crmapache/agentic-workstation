import type { EventFormat, EventPerson, CalendarSource } from '@shared/calendar'
import type { CalendarMeeting } from '@shared/calendar-overlaps'
import type { MoveRecord, OverlapView } from '@shared/calendar-review'
import type { CalendarSettings } from '@shared/calendar-settings'
import { MINUTE_MS } from '@shared/time-units'

/** Гостей по именам в разборе - не больше: дальше хватит числа. */
const GUESTS_LISTED = 12

/** Записей истории переносов в разборе: свежие важнее. */
const MOVES_LISTED = 15

/** Повторов встречи с тем же названием: видно, что это регулярная встреча. */
const REPEATS_LISTED = 6

const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

const clock = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const minutes = (ms: number) => Math.round(ms / MINUTE_MS)

const duration = (ms: number): string => {
  const total = minutes(ms)
  const rest = total % 60

  return total < 60 ? `${total} min` : `${Math.floor(total / 60)} h${rest ? ` ${rest} min` : ''}`
}

const span = (start: number, end: number) =>
  `${day.format(start)}, ${clock.format(start)} - ${clock.format(end)} (${duration(end - start)})`

const minuteClock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

const person = ({ name, email, url }: EventPerson) =>
  [name, email && email !== name ? `<${email}>` : '', url ? `(${url})` : '']
    .filter(Boolean)
    .join(' ')

export type BriefInput = {
  view: OverlapView
  sources: readonly CalendarSource[]
  moves: readonly MoveRecord[]
  /** Начала встреч с тем же названием в том же календаре, кроме этой. */
  repeats: (meeting: CalendarMeeting) => number[]
  settings: CalendarSettings
  zone: string
}

/** Как проходит встреча - словами для ИИ: у личной встречи время уходит ещё и на дорогу. */
const HELD: Record<EventFormat, string> = {
  call: 'online or by phone',
  'in-person': 'in person, so getting there and back takes time too',
  unknown: 'not stated',
}

const meetingLines = (index: number, meeting: CalendarMeeting, input: BriefInput): string[] => {
  const { event } = meeting
  const names = meeting.sourceIds.map(
    (id) => input.sources.find((source) => source.id === id)?.name ?? id,
  )
  const guests = event.attendees.slice(0, GUESTS_LISTED).map(person).join('; ')
  const more = event.attendees.length - GUESTS_LISTED
  const repeats = input
    .repeats(meeting)
    .slice(0, REPEATS_LISTED)
    .map((start) => day.format(start))
    .join(', ')

  return [
    `Call ${index} - calendar "${names.join('", "')}"`,
    `- Title: ${event.title || '(no title)'}`,
    `- When: ${span(event.start, event.end)}`,
    `- Organizer: ${event.organizer ? person(event.organizer) : 'unknown'}`,
    `- Guests (${event.attendees.length}): ${guests || 'not listed'}${more > 0 ? `; and ${more} more` : ''}`,
    `- My answer: ${event.response}; status: ${event.status}; shown as: ${event.busy}`,
    `- Held: ${HELD[event.format]}`,
    ...(event.location ? [`- Where: ${event.location}`] : []),
    `- Join link: ${event.joinUrl ?? 'none'}`,
    ...(event.link ? [`- Event page: ${event.link}`] : []),
    ...event.links.map((link) => `- Link "${link.label}": ${link.url}`),
    `- Same title in this calendar: ${repeats || 'none in the last month and the next three'}`,
  ]
}

const moveLine = (move: MoveRecord, sources: readonly CalendarSource[]) => {
  const calendar = sources.find((source) => source.id === move.sourceId)?.name ?? 'removed'
  const what =
    move.kind === 'moved' && move.to !== null
      ? `moved from ${day.format(move.from)} ${clock.format(move.from)} to ${day.format(move.to)} ${clock.format(move.to)}`
      : `${move.kind} (was ${day.format(move.from)} ${clock.format(move.from)})`

  return `- ${day.format(move.at)}: "${move.title}" (${calendar}${move.organizer ? `, organizer ${move.organizer}` : ''}) ${what}${move.clashed ? ', it was in an overlap' : ''}`
}

/**
 * Разбор накладки для чата ИИ (ADR 0116): обе встречи со всем, что о них известно, история
 * переносов в этих календарях и правила. Главное правило - календари разных работ не
 * смешиваются в словах для людей: в письме одной работе другой работы нет вовсе. И ИИ ничего
 * не отправляет сам - только предлагает и ждёт ответа человека.
 */
export const overlapBrief = (input: BriefInput): { label: string; text: string } => {
  const { view, settings } = input
  const ids = new Set([...view.a.sourceIds, ...view.b.sourceIds])
  const moves = input.moves.filter((move) => ids.has(move.sourceId)).slice(0, MOVES_LISTED)
  const workDays = settings.workDays.map((index) => WEEKDAYS[index]).join(', ')
  const hours = `${minuteClock(settings.workHours.from)}-${minuteClock(settings.workHours.to)}`
  const titleOf = (meeting: CalendarMeeting) => meeting.event.title || '(no title)'

  const label = `Overlap: ${titleOf(view.a)} / ${titleOf(view.b)}`

  return {
    label,
    // Первая строка - подпись чипа в поле чата.
    text: [
      label,
      '',
      'Two of my calls overlap. Study both and suggest how to resolve it.',
      '',
      `Overlap: ${span(view.start, view.end)}${view.soft ? ', one of the calls is tentative' : ''}. Times are local, ${input.zone}. My working hours: ${workDays}, ${hours}.`,
      '',
      ...meetingLines(1, view.a, input),
      '',
      ...meetingLines(2, view.b, input),
      '',
      'Moves and cancellations in these calendars that the calendar sync noticed (newest first):',
      ...(moves.length ? moves.map((move) => moveLine(move, input.sources)) : ['- none yet']),
      '',
      'How to work:',
      '1. Decide which call is less important and why: one-to-one or a big group, external client or internal, who organizes, my answer, optional or tentative, a one-off or a regular meeting, who gave way in earlier overlaps.',
      '2. Suggest what to do with it: move it, join late or leave early, decline, or send someone else. For a move, suggest two or three free times within my working hours: check my calendar with the calendar_events tool.',
      '3. Say whom to write (name and email) and draft the message in the language that call is held in.',
      '4. If you have my mail or chats, you may read earlier talks with these people for context. Read only.',
      '',
      'Hard rules:',
      '- Each calendar is a separate job or part of my life. In anything meant for one call\'s people, never mention the other call, its calendar, company, people or topic, not even as "another client" or "another project". Say only that I have a conflict at that time.',
      '- Send nothing and change nothing: do not send, post, reply, accept, decline, move or create anything in any calendar, mail or chat. Only propose, then wait for my answer.',
      '- Answer me in the language I use with you.',
    ].join('\n'),
  }
}
