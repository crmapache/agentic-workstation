import type { DatabaseSync } from 'node:sqlite'

import type { StatsTotals } from '@shared/statistics'

import type { AgentTime } from './agent-time'
import { turnRows, agentTime, presenceMinutesOf } from './agent-time'
import type { Scope } from './query-scope'
import { agentWhere, humanWhere, HUMAN_PROMPTS } from './query-scope'

type Sums = Record<string, number | null>

const sums = (db: DatabaseSync, sql: string, params: Record<string, number | string>): Sums =>
  (db.prepare(sql).get(params) as Sums | undefined) ?? {}

const n = (value: number | null | undefined): number => value ?? 0

/** Присутствие без фильтра проекта: человек либо у окна, либо нет, в каком бы проекте ни был. */
export const anywhere = (scope: Scope): Scope => ({
  ...scope,
  filter: { ...scope.filter, project: null },
})

/** Время агентов периода - и для сводки, и для графика (одни и те же ходы). */
export const agentTimeOf = (db: DatabaseSync, scope: Scope): AgentTime =>
  agentTime(turnRows(db, scope), scope.from, scope.to, presenceMinutesOf(db, anywhere(scope)))

/** Сводка периода по фильтру. */
export const queryTotals = (
  db: DatabaseSync,
  scope: Scope,
  time = agentTimeOf(db, scope),
): StatsTotals => {
  const agent = agentWhere(scope)
  const human = humanWhere(scope)
  const answers = sums(
    db,
    `SELECT SUM(input) AS input, SUM(output) AS output, SUM(cache_read) AS cacheRead,
       SUM(cache_write) AS cacheWrite, SUM(cost) AS cost, COUNT(*) AS answers,
       COUNT(DISTINCT session) AS sessions
     FROM answers WHERE ${agent.sql}`,
    agent.params,
  )
  const edits = sums(
    db,
    `SELECT SUM(added) AS added, SUM(removed) AS removed, COUNT(DISTINCT file_hash) AS files
     FROM edits WHERE ${agent.sql}`,
    agent.params,
  )
  const prompts = sums(
    db,
    `SELECT COUNT(*) AS prompts FROM prompts WHERE ${HUMAN_PROMPTS} AND ${agent.sql}`,
    agent.params,
  )
  const permissions = sums(
    db,
    `SELECT SUM(decision = 'allow') AS allowed, SUM(decision = 'deny') AS denied
     FROM permissions WHERE ${agent.sql}`,
    agent.params,
  )
  const manual = sums(
    db,
    `SELECT SUM(added) AS added, SUM(removed) AS removed, SUM(typed) AS typed,
       SUM(pasted) AS pasted FROM manual WHERE ${human.sql}`,
    human.params,
  )
  const presence = sums(
    db,
    `SELECT COUNT(DISTINCT minute) AS minutes FROM presence WHERE ${human.sql}`,
    human.params,
  )
  const input = n(answers['input'])
  const cacheRead = n(answers['cacheRead'])
  const cacheWrite = n(answers['cacheWrite'])
  const allowed = n(permissions['allowed'])
  const denied = n(permissions['denied'])
  const modelInput = input + cacheRead + cacheWrite

  return {
    tokens: { input, output: n(answers['output']), cacheRead, cacheWrite },
    cost: n(answers['cost']),
    cacheShare: modelInput > 0 ? cacheRead / modelInput : 0,
    answers: n(answers['answers']),
    agentLinesAdded: n(edits['added']),
    agentLinesRemoved: n(edits['removed']),
    agentFiles: n(edits['files']),
    agentWorkMs: time.workMs,
    agentWorkEstimatedMs: time.estimatedMs,
    agentWallMs: time.wallMs,
    agentsWithoutYouMs: time.withoutYouMs,
    manualLinesAdded: n(manual['added']),
    manualLinesRemoved: n(manual['removed']),
    typed: n(manual['typed']),
    pasted: n(manual['pasted']),
    presenceMinutes: n(presence['minutes']),
    sessions: n(answers['sessions']),
    prompts: n(prompts['prompts']),
    permissions: { asked: allowed + denied, allowed, denied },
  }
}
