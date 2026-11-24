import type { CalendarSource, CalendarFailure } from '@shared/calendar'
import { isAiSourceKind } from '@shared/calendar'
import type { CalendarSettings } from '@shared/calendar-settings'
import { isWorkDay } from '@shared/calendar-settings'
import type { InboxItem } from '@shared/inbox'

import { action, blankItem } from '../inbox/inbox-items'
import { localMidnight } from './calendar-window'

/** Дата дня на часах этого компьютера: «2026-11-24». */
export const localDay = (now: number): string => {
  const date = new Date(now)
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Пора ли утреннему синку: рабочий день, рабочее время идёт, а сегодня его ещё не было.
 * IDE открыли к обеду - синк тогда же; после конца рабочего дня - уже завтра. Ответ - дата
 * дня, которую запомнить, или null.
 */
export const morningDue = (
  settings: CalendarSettings,
  morningOn: string,
  now: number,
): string | null => {
  const today = localDay(now)
  const date = new Date(now)
  const minute = date.getHours() * 60 + date.getMinutes()
  const { from, to } = settings.workHours

  if (settings.morningSync === 'off' || morningOn === today) return null
  if (!isWorkDay(settings, localMidnight(now))) return null

  return minute >= from && minute < to ? today : null
}

/**
 * Что сделать утром с ИИ-источниками, которые сегодня ещё не читались: в браузере -
 * прочитать (если человек так выбрал), по экрану и остальные - напомнить: экранный забирает
 * мышь, его без человека не запускают.
 */
export const morningPlan = (
  settings: CalendarSettings,
  sources: readonly CalendarSource[],
  lastOkAt: (id: string) => number | null,
  now: number,
): { read: CalendarSource[]; remind: CalendarSource[] } => {
  const today = localMidnight(now)
  const stale = sources.filter(
    (source) => isAiSourceKind(source.kind) && (lastOkAt(source.id) ?? 0) < today,
  )
  const reads = (source: CalendarSource) =>
    settings.morningSync === 'sync' && source.kind === 'ai-browser'

  return { read: stale.filter(reads), remind: stale.filter((source) => !reads(source)) }
}

/** Карточка «календари сегодня не читались»: кнопка Sync читает все, вторая открывает календарь. */
export const staleCard = (sources: readonly CalendarSource[]): InboxItem =>
  blankItem({
    kind: 'reminder',
    tone: 'attention',
    title: sources.length === 1 ? 'Calendar not synced today' : 'Calendars not synced today',
    body: [
      ...sources.map((source) => `- ${source.name}`),
      '',
      'AI reads them when you press Sync.',
    ].join('\n'),
    source: 'Calendar',
    actions: [action('syncCalendar', { primary: true }), action('showCalendar')],
  })

/** Почему утренний синк не прочитал источник - словами карточки; редкое - общими. */
const FAILURE_WORDS: Partial<Record<CalendarFailure, string>> = {
  'login-required': 'sign in to the calendar in that Chrome profile',
  'profile-offline': 'the Chrome profile is not open',
  'provider-missing': 'the AI is not installed or did not answer',
  timeout: 'it took too long',
  'connector-off': 'its connector is turned off',
}

/** Утренний синк не прочитал источник: человек узнаёт сразу, а не к первой накладке. */
export const morningFailureCard = (source: CalendarSource, failure: CalendarFailure): InboxItem =>
  blankItem({
    kind: 'message',
    tone: 'attention',
    title: `${source.name} did not sync`,
    body: `The morning sync could not read it: ${FAILURE_WORDS[failure] ?? 'AI could not read the calendar'}.`,
    source: 'Calendar',
    actions: [action('showCalendar', { primary: true })],
  })
