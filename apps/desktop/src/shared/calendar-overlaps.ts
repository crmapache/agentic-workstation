import type { CalendarEvent } from './calendar'
import { MINUTE_MS } from './time-units'

/**
 * Встреча на сетке: одно событие или его дубли из разных календарей (приглашение пришло и в
 * рабочий, и в личный). Дубли накладкой не считаются.
 */
export type CalendarMeeting = {
  /** Ключ первого события (по порядку источников). */
  key: string
  event: CalendarEvent
  /** Источники встречи; первый - главный, его цвет основной. */
  sourceIds: string[]
}

/** Две встречи заняли одно время. */
export type CalendarOverlap = {
  /** Одинаковый у одной и той же пары, пока встречи не перенесли: по нему объявляют один раз. */
  key: string
  a: string
  b: string
  /** Общий отрезок, мс UTC. */
  start: number
  end: number
  /** Одна из встреч под вопросом: накладка мягче. */
  soft: boolean
}

/** Дубли - в пределах минуты: календари округляют по-разному. */
const SAME_TIME_MS = MINUTE_MS

/** Накладка - от минуты общего времени; встык (конец одной = начало другой) - нет. */
const OVERLAP_MIN_MS = MINUTE_MS

/** Название без регистра, пробелов по краям и повторных пробелов. */
export const normalTitle = (title: string): string =>
  title.trim().toLowerCase().replace(/\s+/g, ' ')

const sameTime = (a: CalendarEvent, b: CalendarEvent): boolean =>
  Math.abs(a.start - b.start) <= SAME_TIME_MS && Math.abs(a.end - b.end) <= SAME_TIME_MS

const isDuplicate = (a: CalendarEvent, b: CalendarEvent): boolean => {
  if ((a.allDay === null) !== (b.allDay === null) || !sameTime(a, b)) return false

  return (
    (a.uid !== '' && a.uid === b.uid) ||
    normalTitle(a.title) === normalTitle(b.title) ||
    (a.joinUrl !== null && a.joinUrl === b.joinUrl)
  )
}

/**
 * События всех источников - встречами: дубли сливаются. sourceOrder - порядок источников
 * (главный у встречи - раньше стоящий), события вне его идут последними.
 */
export const meetingsOf = (
  events: readonly CalendarEvent[],
  sourceOrder: readonly string[] = [],
): CalendarMeeting[] => {
  const rank = (sourceId: string) => {
    const index = sourceOrder.indexOf(sourceId)

    return index < 0 ? sourceOrder.length : index
  }
  const sorted = [...events].sort(
    (a, b) => a.start - b.start || rank(a.sourceId) - rank(b.sourceId) || a.end - b.end,
  )
  const meetings: CalendarMeeting[] = []

  const twinOf = (event: CalendarEvent): CalendarMeeting | null => {
    // Встречи упорядочены по началу, а дубль начинается не раньше минуты до события: дальше
    // назад смотреть незачем.
    for (let index = meetings.length - 1; index >= 0; index -= 1) {
      const meeting = meetings[index]

      if (!meeting || meeting.event.start < event.start - SAME_TIME_MS) return null
      if (isDuplicate(meeting.event, event)) return meeting
    }

    return null
  }

  for (const event of sorted) {
    const twin = twinOf(event)

    if (twin) {
      if (!twin.sourceIds.includes(event.sourceId)) twin.sourceIds.push(event.sourceId)
    } else {
      meetings.push({ key: event.key, event, sourceIds: [event.sourceId] })
    }
  }

  return meetings
}

/** Занимает ли встреча время: весь день, отмена, мой отказ и «свободен» - нет. */
export const takesTime = (event: CalendarEvent): boolean =>
  event.allDay === null &&
  event.status !== 'cancelled' &&
  event.response !== 'declined' &&
  event.busy !== 'free' &&
  event.end > event.start

const isSoft = (event: CalendarEvent): boolean =>
  event.status === 'tentative' || event.busy === 'tentative' || event.response === 'tentative'

/** Кто встреча для ключа накладки: UID (или название) и минута начала. */
const identity = (meeting: CalendarMeeting): string =>
  `${meeting.event.uid || normalTitle(meeting.event.title)}@${Math.floor(meeting.event.start / MINUTE_MS)}`

export const overlapKey = (a: CalendarMeeting, b: CalendarMeeting): string =>
  [identity(a), identity(b)].sort().join(' & ')

/**
 * Накладка ещё впереди или идёт сейчас. Прошедшую уже не разруливают: она не горит на сетке,
 * не считается и не предлагает «видел» и разбор ИИ.
 */
export const isAhead = (overlap: Pick<CalendarOverlap, 'end'>, now: number): boolean =>
  overlap.end > now

/**
 * Накладки встреч: пары, у которых общего времени не меньше минуты. counts - учитывает ли
 * источник накладки (галочка у источника); встреча участвует, если её учитывает хоть один из
 * её источников.
 */
export const overlapsOf = (
  meetings: readonly CalendarMeeting[],
  counts: (sourceId: string) => boolean = () => true,
): CalendarOverlap[] => {
  const candidates = meetings
    .filter((meeting) => takesTime(meeting.event) && meeting.sourceIds.some(counts))
    .sort((a, b) => a.event.start - b.event.start)
  const overlaps: CalendarOverlap[] = []
  let active: CalendarMeeting[] = []

  for (const meeting of candidates) {
    active = active.filter((open) => open.event.end - meeting.event.start >= OVERLAP_MIN_MS)

    for (const open of active) {
      const end = Math.min(open.event.end, meeting.event.end)

      if (end - meeting.event.start < OVERLAP_MIN_MS) continue

      overlaps.push({
        key: overlapKey(open, meeting),
        a: open.key,
        b: meeting.key,
        start: meeting.event.start,
        end,
        soft: isSoft(open.event) || isSoft(meeting.event),
      })
    }

    active.push(meeting)
  }

  return overlaps
}
