import type { DatabaseSync } from 'node:sqlite'

import { modelFamilyOf, CLAUDE_MODEL_FAMILIES } from '@shared/claude-models'
import type {
  StatsToolRow,
  StatsModelRow,
  StatsServerRow,
  StatsProjectRow,
  StatsLanguageRow,
} from '@shared/statistics'

import { TOP_ROWS } from '../stats.constants'
import type { TurnRow } from './agent-time'
import { effectiveTurns } from './agent-time'
import type { Scope } from './query-scope'
import { agentWhere, humanWhere } from './query-scope'
import { clip } from './time-math'

/** Модели периода: токены по видам, стоимость и сколько ответов. */
export const queryModels = (db: DatabaseSync, scope: Scope): StatsModelRow[] => {
  const where = agentWhere(scope)
  const rows = db
    .prepare(
      `SELECT model, SUM(input) AS input, SUM(output) AS output, SUM(cache_read) AS cacheRead,
         SUM(cache_write) AS cacheWrite, SUM(cost) AS cost, COUNT(*) AS answers
       FROM answers WHERE ${where.sql} GROUP BY model ORDER BY cost DESC`,
    )
    .all(where.params) as {
    model: string
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    cost: number
    answers: number
  }[]

  return rows.map((row) => ({
    model: row.model,
    family: modelFamilyOf(row.model, CLAUDE_MODEL_FAMILIES) ?? 'other',
    tokens: {
      input: row.input,
      output: row.output,
      cacheRead: row.cacheRead,
      cacheWrite: row.cacheWrite,
    },
    cost: row.cost,
    answers: row.answers,
  }))
}

/**
 * Проекты периода. Записи помнят папку, а не проект: проект папки решает главный процесс
 * (places.project), так что строки складываются по нему здесь.
 */
export const queryProjects = (
  db: DatabaseSync,
  scope: Scope,
  turns: readonly TurnRow[],
): StatsProjectRow[] => {
  const where = agentWhere(scope)
  const projectOf = new Map(
    (
      db.prepare('SELECT id, project FROM places').all() as { id: number; project: string | null }[]
    ).map((row) => [row.id, row.project]),
  )
  const table = new Map<string | null, StatsProjectRow>()
  const rowOf = (place: number | null): StatsProjectRow => {
    const project = place === null ? null : (projectOf.get(place) ?? null)
    const known = table.get(project)

    if (known) return known

    const row = {
      project,
      tokens: 0,
      cost: 0,
      agentLinesAdded: 0,
      agentLinesRemoved: 0,
      agentWorkMs: 0,
    }

    table.set(project, row)

    return row
  }

  for (const row of db
    .prepare(
      `SELECT place, SUM(input + output + cache_read + cache_write) AS tokens, SUM(cost) AS cost
       FROM answers WHERE ${where.sql} GROUP BY place`,
    )
    .all(where.params) as { place: number | null; tokens: number; cost: number }[]) {
    const target = rowOf(row.place)

    target.tokens += row.tokens
    target.cost += row.cost
  }

  for (const row of db
    .prepare(
      `SELECT place, SUM(added) AS added, SUM(removed) AS removed FROM edits
       WHERE ${where.sql} GROUP BY place`,
    )
    .all(where.params) as { place: number | null; added: number; removed: number }[]) {
    const target = rowOf(row.place)

    target.agentLinesAdded += row.added
    target.agentLinesRemoved += row.removed
  }

  for (const turn of effectiveTurns(turns)) {
    const piece = clip({ start: turn.started_at, end: turn.ended_at }, scope.from, scope.to)
    const length = turn.ended_at - turn.started_at

    if (piece)
      rowOf(turn.place).agentWorkMs +=
        turn.work_ms * (length > 0 ? (piece.end - piece.start) / length : 1)
  }

  return [...table.values()].sort((a, b) => b.tokens - a.tokens || b.agentWorkMs - a.agentWorkMs)
}

/** Частые инструменты (без MCP) и серверы MCP. */
export const queryTools = (
  db: DatabaseSync,
  scope: Scope,
): { tools: StatsToolRow[]; servers: StatsServerRow[] } => {
  const where = agentWhere(scope)
  const tools = db
    .prepare(
      `SELECT tool, COUNT(*) AS calls FROM tool_calls WHERE server IS NULL AND ${where.sql}
       GROUP BY tool ORDER BY calls DESC LIMIT ${TOP_ROWS}`,
    )
    .all(where.params) as StatsToolRow[]
  const servers = db
    .prepare(
      `SELECT server, COUNT(*) AS calls FROM tool_calls WHERE server IS NOT NULL AND ${where.sql}
       GROUP BY server ORDER BY calls DESC LIMIT ${TOP_ROWS}`,
    )
    .all(where.params) as StatsServerRow[]

  return { tools, servers }
}

/** Языки по расширениям: строки агентов и руками рядом. */
export const queryLanguages = (db: DatabaseSync, scope: Scope): StatsLanguageRow[] => {
  const agent = agentWhere(scope)
  const human = humanWhere(scope)
  const table = new Map<string, StatsLanguageRow>()
  const rowOf = (ext: string) => {
    const row = table.get(ext) ?? {
      ext,
      agentAdded: 0,
      agentRemoved: 0,
      manualAdded: 0,
      manualRemoved: 0,
    }

    table.set(ext, row)

    return row
  }

  for (const row of db
    .prepare(
      `SELECT ext, SUM(added) AS added, SUM(removed) AS removed FROM edits WHERE ${agent.sql} GROUP BY ext`,
    )
    .all(agent.params) as { ext: string; added: number; removed: number }[]) {
    rowOf(row.ext).agentAdded += row.added
    rowOf(row.ext).agentRemoved += row.removed
  }

  for (const row of db
    .prepare(
      `SELECT ext, SUM(added) AS added, SUM(removed) AS removed FROM manual WHERE ${human.sql} GROUP BY ext`,
    )
    .all(human.params) as { ext: string; added: number; removed: number }[]) {
    rowOf(row.ext).manualAdded += row.added
    rowOf(row.ext).manualRemoved += row.removed
  }

  return [...table.values()]
    .sort(
      (a, b) =>
        b.agentAdded +
        b.agentRemoved +
        b.manualAdded +
        b.manualRemoved -
        (a.agentAdded + a.agentRemoved + a.manualAdded + a.manualRemoved),
    )
    .slice(0, TOP_ROWS)
}
