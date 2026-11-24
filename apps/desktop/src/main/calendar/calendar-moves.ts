import type { CalendarEvent } from '@shared/calendar'
import { normalTitle } from '@shared/calendar-overlaps'
import type { MoveKind, MoveRecord } from '@shared/calendar-review'
import { DAY_MS, MINUTE_MS } from '@shared/time-units'

import type { SyncWindow } from './calendar-window'

/** История переносов - полгода и не больше двухсот записей: ИИ нужен характер, а не архив. */
const MOVES_KEEP_MS = 180 * DAY_MS
const MOVES_MAX = 200

/** Перенос у ИИ-источника ищется по названию в пределах двух недель: дальше - другая встреча. */
const RETITLE_SPAN_MS = 14 * DAY_MS

export type MovesInput = {
  previous: readonly CalendarEvent[]
  next: readonly CalendarEvent[]
  /** Окно, которое источник прочитал целиком: вне его отсутствие - не удаление. */
  covered: SyncWindow
  now: number
  /**
   * Ключ события ИИ-источника - отпечаток названия и начала: перенос меняет ключ, и встречу
   * узнают по названию.
   */
  byTitle: boolean
  /** Стояла ли встреча в накладке на прежнем времени. */
  clashed: (event: CalendarEvent) => boolean
}

const record = (
  event: CalendarEvent,
  kind: MoveKind,
  to: number | null,
  input: MovesInput,
): MoveRecord => ({
  at: input.now,
  sourceId: event.sourceId,
  title: event.title,
  organizer: event.organizer?.name ?? null,
  from: event.start,
  to,
  kind,
  clashed: input.clashed(event),
})

/** Отказ или отмена встречи, что стоит на месте. */
const statusChange = (before: CalendarEvent, after: CalendarEvent): MoveKind | null => {
  if (after.status === 'cancelled' && before.status !== 'cancelled') return 'cancelled'
  if (after.response === 'declined' && before.response !== 'declined') return 'declined'

  return null
}

/**
 * Что стало со встречами впереди между двумя чтениями источника: перенесена, отклонена,
 * отменена или исчезла. Смотрятся только будущие встречи со временем внутри прочитанного окна,
 * которые занимали время (уже отклонённая второй раз не считается).
 */
export const movesBetween = (input: MovesInput): MoveRecord[] => {
  const { previous, next, covered, now } = input
  const nextByKey = new Map(next.map((event) => [event.key, event]))
  const previousKeys = new Set(previous.map((event) => event.key))
  // Новые слоты ИИ-источника: событие, которого раньше не было, - кандидат на «куда перенесли».
  const fresh = next.filter((event) => !previousKeys.has(event.key) && event.allDay === null)
  const taken = new Set<string>()
  const moves: MoveRecord[] = []

  for (const before of previous) {
    const inWindow = before.start >= covered.from && before.start < covered.to
    const active = before.status !== 'cancelled' && before.response !== 'declined'

    if (before.allDay || before.start <= now || !inWindow || !active) continue

    const after = nextByKey.get(before.key)

    if (after) {
      const change = statusChange(before, after)

      if (Math.abs(after.start - before.start) >= MINUTE_MS) {
        moves.push(record(before, 'moved', after.start, input))
      } else if (change) {
        moves.push(record(before, change, null, input))
      }

      continue
    }

    const title = normalTitle(before.title)
    const twin = input.byTitle
      ? fresh
          .filter(
            (event) =>
              !taken.has(event.key) &&
              normalTitle(event.title) === title &&
              Math.abs(event.start - before.start) <= RETITLE_SPAN_MS,
          )
          .sort((a, b) => Math.abs(a.start - before.start) - Math.abs(b.start - before.start))[0]
      : undefined

    if (twin) {
      taken.add(twin.key)
      moves.push(record(before, statusChange(before, twin) ?? 'moved', twin.start, input))
    } else {
      moves.push(record(before, 'removed', null, input))
    }
  }

  return moves
}

/** История с новыми записями: новые первыми, старше полугода и сверх предела - прочь. */
export const keepMoves = (
  history: readonly MoveRecord[],
  fresh: readonly MoveRecord[],
  now: number,
): MoveRecord[] =>
  [...fresh, ...history].filter((move) => now - move.at < MOVES_KEEP_MS).slice(0, MOVES_MAX)
