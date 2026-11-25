import type { CalendarSource } from '@shared/calendar'
import type { CalendarMeeting } from '@shared/calendar-overlaps'
import { takesTime } from '@shared/calendar-overlaps'
import type { InboxItem } from '@shared/inbox'
import { DAY_MS, MINUTE_MS } from '@shared/time-units'

import { action, blankItem } from '../inbox/inbox-items'

/** Напоминание ещё уместно минуту после начала: IDE могла проснуться позже. */
const LATE_MS = MINUTE_MS

export type DueReminder = { meeting: CalendarMeeting; minutesLeft: number }

/** Ключ напоминания: встреча, её начало (перенос - новое напоминание) и за сколько минут. */
const reminderKey = (meeting: CalendarMeeting, minutes: number): string =>
  `${meeting.key}@${meeting.event.start}@${minutes}`

/**
 * Каким встречам пора напомнить: настал срок хоть одного напоминания, которого ещё не было.
 * Несколько сроков разом (IDE открыли за пять минут до звонка) - одно напоминание. Отметки
 * прошедших встреч забываются через сутки.
 */
export const dueReminders = (
  meetings: readonly CalendarMeeting[],
  reminders: readonly number[],
  reminded: Readonly<Record<string, number>>,
  now: number,
): { due: DueReminder[]; reminded: Record<string, number> } => {
  const kept = Object.fromEntries(
    Object.entries(reminded).filter(([, start]) => start > now - DAY_MS),
  )
  const due: DueReminder[] = []

  for (const meeting of meetings) {
    const { start } = meeting.event

    if (!takesTime(meeting.event) || start + LATE_MS < now) continue

    const passed = reminders.filter((minutes) => start - minutes * MINUTE_MS <= now)
    const fresh = passed.some((minutes) => !(reminderKey(meeting, minutes) in kept))

    for (const minutes of passed) kept[reminderKey(meeting, minutes)] = start

    if (fresh) {
      due.push({ meeting, minutesLeft: Math.max(0, Math.round((start - now) / MINUTE_MS)) })
    }
  }

  return { due, reminded: kept }
}

/** «5 min», «1 h 30 min», «2 d»: сколько осталось до звонка. */
export const leftLabel = (minutes: number): string => {
  if (minutes >= 24 * 60) return `${Math.round(minutes / (24 * 60))} d`
  if (minutes < 60) return `${minutes} min`

  const rest = minutes % 60

  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${minutes / 60} h`
}

const clock = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/**
 * Напоминание о звонке карточкой в уведомлениях IDE. Заголовок - название встречи, как оно стоит
 * в календаре; строкой ниже - сколько осталось, время и из какого календаря, ещё строкой - где.
 * Join - первой кнопкой, если у звонка есть ссылка. Названия - из календарей человека, это его
 * лента.
 */
export const reminderCard = (
  { meeting, minutesLeft }: DueReminder,
  sources: readonly CalendarSource[],
): InboxItem => {
  const { event } = meeting
  const calendar = sources.find((source) => source.id === meeting.sourceIds[0])?.name ?? ''
  const left = minutesLeft === 0 ? 'Starting now' : `In ${leftLabel(minutesLeft)}`
  const when = `**${clock.format(event.start)} - ${clock.format(event.end)}**`

  return blankItem({
    kind: 'reminder',
    tone: 'info',
    title: event.title || '(No title)',
    // Жёсткий перенос Markdown (два пробела в конце строки): место встаёт своей строкой и в
    // карточке, а не приклеивается к имени календаря.
    body: [[left, when, calendar].filter(Boolean).join(' · '), event.location]
      .filter(Boolean)
      .join('  \n'),
    source: 'Calendar',
    actions: [
      ...(event.joinUrl
        ? [action('open', { id: 'join', label: 'Join', value: event.joinUrl, primary: true })]
        : []),
      action('showCalendar', { primary: !event.joinUrl }),
    ],
  })
}
