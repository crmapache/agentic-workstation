import type { SourceSync, CalendarEvent, CalendarFailure } from '@shared/calendar'

import type { SyncWindow } from './calendar-window'
import { touches } from './calendar-window'

/** Прочитанное источником: события и окно, которое он подтвердил прочитанным целиком. */
export type SourceResult =
  | {
      ok: true
      events: CalendarEvent[]
      covered: SyncWindow
      /** Читал ИИ: пусто там, где раньше были события, - подозрительно. */
      byAi: boolean
    }
  | { ok: false; failure: CalendarFailure }

/** С какого числа прежних событий пустой ответ ИИ уже подозрителен, а не просто тихая неделя. */
const SUSPICIOUS_EMPTY_FROM = 3

const inWindow = (window: SyncWindow) => (event: CalendarEvent) =>
  touches(window, event.start, event.end)

/**
 * Новый снимок источника: прежние события внутри прочитанного окна заменяются прочитанными,
 * вне окна - остаются (ИИ читает две недели, прошлое не теряется). Всё вне kept выбрасывается.
 */
export const replaceCovered = (
  previous: readonly CalendarEvent[],
  incoming: readonly CalendarEvent[],
  covered: SyncWindow,
  kept: SyncWindow,
): CalendarEvent[] =>
  [...previous.filter((event) => !inWindow(covered)(event)), ...incoming.filter(inWindow(covered))]
    .filter(inWindow(kept))
    .sort((a, b) => a.start - b.start)

/** ИИ вернул пусто, а раньше в этом окне событий было несколько: принять, но пометить. */
export const isSuspiciousEmpty = (
  previous: readonly CalendarEvent[],
  incoming: readonly CalendarEvent[],
  covered: SyncWindow,
): boolean =>
  !incoming.some(inWindow(covered)) &&
  previous.filter(inWindow(covered)).length >= SUSPICIOUS_EMPTY_FROM

/** Синк источника после чтения: удача сбрасывает причину, неудача оставляет прежний снимок. */
export const syncAfter = (
  previous: SourceSync,
  result: SourceResult,
  snapshot: readonly CalendarEvent[],
  warned: boolean,
  now: number,
): SourceSync =>
  result.ok
    ? {
        phase: 'idle',
        lastOkAt: now,
        lastTriedAt: now,
        covered: result.covered,
        failure: null,
        warning: warned ? 'suspicious-empty' : null,
        count: snapshot.length,
      }
    : { ...previous, phase: 'idle', lastTriedAt: now, failure: result.failure }
