import type { DatabaseSync } from 'node:sqlite'

import type { StatsFilter, StatsPeriod, StatsReport, StatsScanProgress } from '@shared/statistics'

import { MINUTE_MS } from '../stats.constants'
import { turnRows, agentTime, presenceMinutesOf } from './agent-time'
import { queryTools, queryModels, queryProjects, queryLanguages } from './breakdown-query'
import { queryPeak, queryStreaks, queryCalendar, queryWorkSessions } from './habits-query'
import type { Scope } from './query-scope'
import { queryScenarios } from './scenario-query'
import { querySeries, bucketSizeOf, bucketStarts } from './series-query'
import { anywhere, queryTotals } from './totals-query'

type Earliest = { at: number | null }

const earliest = (db: DatabaseSync, sql: string): number | null =>
  (db.prepare(sql).get() as Earliest | undefined)?.at ?? null

/**
 * Начало данных: агентских (транскрипты хранят около 30 дней) и человеческих (присутствие и
 * правки руками - с выпуска статистики). Сравнение с прошлым периодом честно, только если
 * тот целиком лежит в данных.
 */
export const dataStartOf = (db: DatabaseSync): { all: number | null; human: number | null } => {
  const human = earliest(
    db,
    `SELECT MIN(at) AS at FROM (
       SELECT MIN(minute) * ${MINUTE_MS} AS at FROM presence
       UNION ALL SELECT MIN(minute) * ${MINUTE_MS} FROM manual)`,
  )
  const agent = earliest(
    db,
    `SELECT MIN(at) AS at FROM (
       SELECT MIN(ts) AS at FROM answers UNION ALL SELECT MIN(ts) FROM prompts
       UNION ALL SELECT MIN(started_at) FROM turns UNION ALL SELECT MIN(started_at) FROM scenario_runs)`,
  )
  const all = [human, agent].filter((value) => value !== null)

  return { all: all.length > 0 ? Math.min(...all) : null, human }
}

/** Всё окно статистики за период и фильтр одним запросом к базе. */
export const buildReport = (
  db: DatabaseSync,
  period: StatsPeriod,
  filter: StatsFilter,
  now: number,
  scan: StatsScanProgress,
): StatsReport => {
  const scope: Scope = { from: period.from, to: period.to, filter }
  const start = dataStartOf(db)
  const rows = turnRows(db, scope)
  const time = agentTime(rows, scope.from, scope.to, presenceMinutesOf(db, anywhere(scope)))
  const length = scope.to - scope.from
  const previousFrom = scope.from - length
  const size = bucketSizeOf(scope.from, scope.to)
  // «Всё время» начинается с эпохи: дни графика - с первого дня данных, а не с 1970 года.
  const seriesFrom = size === 'day' ? Math.max(scope.from, start.all ?? scope.to) : scope.from
  const starts = bucketStarts(seriesFrom, scope.to, size)
  const { tools, servers } = queryTools(db, scope)

  return {
    period,
    filter,
    dataStart: start.all,
    humanDataStart: start.human,
    totals: queryTotals(db, scope, time),
    previous:
      start.all !== null && length > 0 && previousFrom >= start.all
        ? queryTotals(db, { ...scope, from: previousFrom, to: scope.from })
        : null,
    series: querySeries(db, scope, starts, size, time.wall),
    models: queryModels(db, scope),
    projects: queryProjects(db, scope, rows),
    tools,
    servers,
    languages: queryLanguages(db, scope),
    calendar: queryCalendar(db, scope, now),
    streaks: queryStreaks(db, scope, now),
    peak: queryPeak(db, scope),
    workSessions: queryWorkSessions(db, scope),
    scenarios: queryScenarios(db, scope),
    scan,
  }
}
