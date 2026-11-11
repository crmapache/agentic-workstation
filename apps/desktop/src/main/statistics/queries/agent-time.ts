import type { DatabaseSync } from 'node:sqlite'

import type { Scope } from './query-scope'
import { turnWhere, humanWhere } from './query-scope'
import type { Interval } from './time-math'
import { clip, totalLength, lengthOutside, unionIntervals, minuteIntervals } from './time-math'

/** Ход из базы: живые часы IDE (exact) или кусок оценки по транскрипту. */
export type TurnRow = {
  session: number
  place: number | null
  started_at: number
  ended_at: number
  work_ms: number
  exact: number
}

/** Время агентов за период. */
export type AgentTime = {
  workMs: number
  estimatedMs: number
  wallMs: number
  withoutYouMs: number
  /** Объединённые отрезки работы - для графика по часам и дням. */
  wall: Interval[]
}

/**
 * Оценка, задевающая точный ход той же сессии, - не в счёт. turn-writer.ts уже не пишет
 * таких, но точный ход мог прийти после последнего пересчёта.
 */
export const effectiveTurns = (rows: readonly TurnRow[]): TurnRow[] => {
  const exact = new Map<number, TurnRow[]>()

  for (const row of rows) {
    if (row.exact === 1) exact.set(row.session, [...(exact.get(row.session) ?? []), row])
  }

  return rows.filter(
    (row) =>
      row.exact === 1 ||
      !(exact.get(row.session) ?? []).some(
        (turn) => row.started_at < turn.ended_at && row.ended_at > turn.started_at,
      ),
  )
}

/**
 * Работа (сумма ходов, параллельные складываются), настенное время (объединение) и время без
 * человека. Ход на границе периода режется: у оценки работа - вся её длина, у точного хода
 * работа меньше длины (без ожидания ответа человека) и режется в той же доле.
 */
export const agentTime = (
  rows: readonly TurnRow[],
  from: number,
  to: number,
  presenceMinutes: readonly number[],
): AgentTime => {
  let workMs = 0
  let estimatedMs = 0
  const pieces: Interval[] = []

  for (const row of effectiveTurns(rows)) {
    const piece = clip({ start: row.started_at, end: row.ended_at }, from, to)

    if (!piece) continue

    const length = row.ended_at - row.started_at
    const share = length > 0 ? (piece.end - piece.start) / length : 1
    const work = row.work_ms * share

    workMs += work
    if (row.exact !== 1) estimatedMs += work

    pieces.push(piece)
  }

  const wall = unionIntervals(pieces)
  const presence = minuteIntervals(presenceMinutes)

  return {
    workMs,
    estimatedMs,
    wallMs: totalLength(wall),
    withoutYouMs: lengthOutside(wall, presence),
    wall,
  }
}

/** Ходы периода с фильтром. */
export const turnRows = (db: DatabaseSync, scope: Scope): TurnRow[] => {
  const where = turnWhere(scope)

  return db
    .prepare(
      `SELECT session, place, started_at, ended_at, work_ms, exact FROM turns WHERE ${where.sql}`,
    )
    .all(where.params) as TurnRow[]
}

/** Минуты присутствия периода без повторов (два проекта в одну минуту - одна минута). */
export const presenceMinutesOf = (db: DatabaseSync, scope: Scope): number[] => {
  const where = humanWhere(scope)
  const rows = db
    .prepare(`SELECT DISTINCT minute FROM presence WHERE ${where.sql} ORDER BY minute`)
    .all(where.params) as { minute: number }[]

  return rows.map((row) => row.minute)
}
