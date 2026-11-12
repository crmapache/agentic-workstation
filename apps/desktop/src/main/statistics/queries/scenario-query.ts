import type { DatabaseSync } from 'node:sqlite'

import type { StatsScenarios, StatsScenarioRow } from '@shared/statistics'

import { TOP_ROWS } from '../stats.constants'
import type { Scope } from './query-scope'
import { scenarioWhere } from './query-scope'

/** Конечные состояния прогона: успех и неуспех (остановлен человеком - тоже неуспех). */
const FINISHED = "('done', 'failed', 'stopped')"

/** Прогоны сценариев, начатые в периоде. */
export const queryScenarios = (db: DatabaseSync, scope: Scope): StatsScenarios => {
  const where = scenarioWhere(scope)
  const summary = db
    .prepare(
      `SELECT COUNT(*) AS runs, SUM(state = 'done') AS done, SUM(state IN ${FINISHED}) AS finished,
         AVG(active_ms) AS activeMs, AVG(cost) AS cost
       FROM scenario_runs WHERE ${where.sql}`,
    )
    .get(where.params) as {
    runs: number
    done: number | null
    finished: number | null
    activeMs: number | null
    cost: number | null
  }
  const top = db
    .prepare(
      `SELECT scenario, COUNT(*) AS runs FROM scenario_runs WHERE ${where.sql}
       GROUP BY scenario ORDER BY runs DESC LIMIT ${TOP_ROWS}`,
    )
    .all(where.params) as StatsScenarioRow[]
  const finished = summary.finished ?? 0

  return {
    runs: summary.runs,
    doneShare: finished > 0 ? (summary.done ?? 0) / finished : 0,
    averageActiveMs: summary.activeMs ?? 0,
    averageCost: summary.cost ?? 0,
    top,
  }
}
