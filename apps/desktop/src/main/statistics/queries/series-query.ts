import type { DatabaseSync } from 'node:sqlite'

import type { StatsSeries, StatsBucketSize, StatsSeriesPoint } from '@shared/statistics'
import { HOUR_MS, MINUTE_MS } from '@shared/time-units'

import { SLOT_MS, HOURLY_PERIOD_MAX_MS } from '../stats.constants'
import type { Scope } from './query-scope'
import { agentWhere, humanWhere } from './query-scope'
import type { Interval } from './time-math'

/** Короткий период - по часам, длинный - по дням. */
export const bucketSizeOf = (from: number, to: number): StatsBucketSize =>
  to - from <= HOURLY_PERIOD_MAX_MS ? 'hour' : 'day'

/**
 * Начала шагов графика по местному времени. Дни - через календарь (сутки при переводе
 * часов - 23 или 25 часов), часы - шагом настоящего часа от местного начала часа.
 */
export const bucketStarts = (from: number, to: number, size: StatsBucketSize): number[] => {
  const cursor = new Date(from)
  const starts: number[] = []

  if (size === 'day') cursor.setHours(0, 0, 0, 0)
  else cursor.setMinutes(0, 0, 0)

  while (cursor.getTime() < to) {
    starts.push(cursor.getTime())

    if (size === 'day') cursor.setDate(cursor.getDate() + 1)
    else cursor.setTime(cursor.getTime() + HOUR_MS)
  }

  return starts
}

/** Индекс шага, в который попадает момент; -1 - раньше первого. */
export const bucketIndex = (starts: readonly number[], at: number): number => {
  let low = 0
  let high = starts.length - 1
  let found = -1

  while (low <= high) {
    const middle = (low + high) >> 1

    if ((starts[middle] ?? Infinity) <= at) {
      found = middle
      low = middle + 1
    } else high = middle - 1
  }

  return found
}

type SlotRow = { slot: number; a: number | null; b: number | null }

const emptyPoint = (start: number): StatsSeriesPoint => ({
  start,
  tokens: 0,
  cost: 0,
  agentLinesAdded: 0,
  agentLinesRemoved: 0,
  manualLinesAdded: 0,
  manualLinesRemoved: 0,
  agentMinutes: 0,
  presenceMinutes: 0,
})

/**
 * График периода. SQL складывает по четвертям часа (SLOT_MS), JS раскладывает четверти по
 * местным часам и дням: перевод в местное время в SQLite не знает о переводе часов.
 */
export const querySeries = (
  db: DatabaseSync,
  scope: Scope,
  starts: readonly number[],
  size: StatsBucketSize,
  wall: readonly Interval[],
): StatsSeries => {
  const points = starts.map(emptyPoint)
  const agent = agentWhere(scope)
  const human = humanWhere(scope)
  const add = (
    sql: string,
    params: Record<string, number | string>,
    apply: (point: StatsSeriesPoint, row: SlotRow) => void,
  ) => {
    for (const row of db.prepare(sql).all(params) as SlotRow[]) {
      const point = points[bucketIndex(starts, row.slot * SLOT_MS)]

      if (point) apply(point, row)
    }
  }
  const perMinuteSlot = SLOT_MS / MINUTE_MS

  add(
    `SELECT ts / ${SLOT_MS} AS slot, SUM(input + output + cache_read + cache_write) AS a, SUM(cost) AS b
     FROM answers WHERE ${agent.sql} GROUP BY slot`,
    agent.params,
    (point, row) => {
      point.tokens += row.a ?? 0
      point.cost += row.b ?? 0
    },
  )
  add(
    `SELECT ts / ${SLOT_MS} AS slot, SUM(added) AS a, SUM(removed) AS b FROM edits
     WHERE ${agent.sql} GROUP BY slot`,
    agent.params,
    (point, row) => {
      point.agentLinesAdded += row.a ?? 0
      point.agentLinesRemoved += row.b ?? 0
    },
  )
  add(
    `SELECT minute / ${perMinuteSlot} AS slot, SUM(added) AS a, SUM(removed) AS b FROM manual
     WHERE ${human.sql} GROUP BY slot`,
    human.params,
    (point, row) => {
      point.manualLinesAdded += row.a ?? 0
      point.manualLinesRemoved += row.b ?? 0
    },
  )
  add(
    `SELECT minute / ${perMinuteSlot} AS slot, COUNT(DISTINCT minute) AS a, 0 AS b FROM presence
     WHERE ${human.sql} GROUP BY slot`,
    human.params,
    (point, row) => {
      point.presenceMinutes += row.a ?? 0
    },
  )

  for (const interval of wall) spread(points, starts, interval)

  return { bucket: size, points }
}

/** Отрезок работы агентов - минутами по шагам, через которые он прошёл. */
const spread = (points: StatsSeriesPoint[], starts: readonly number[], interval: Interval) => {
  let cursor = interval.start

  for (let index = Math.max(0, bucketIndex(starts, cursor)); cursor < interval.end; index += 1) {
    const point = points[index]

    if (!point) return

    const end = Math.min(interval.end, starts[index + 1] ?? Infinity)

    if (end > cursor) point.agentMinutes += (end - cursor) / MINUTE_MS

    cursor = Math.max(cursor, end)
  }
}
