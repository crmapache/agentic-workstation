import type { StatsFilter } from '@shared/statistics'

import { MINUTE_MS } from '../stats.constants'

/** Выборка: период [from, to) в мс и фильтр окна. */
export type Scope = { from: number; to: number; filter: StatsFilter }

/** Кусок WHERE и его именованные параметры (node:sqlite - без префикса в ключах). */
export type Where = { sql: string; params: Record<string, number | string> }

const IDE_SESSIONS = 'SELECT id FROM sessions WHERE ide_kind IS NOT NULL'

/** Источник: сессии, которые запускала IDE, или все остальные. */
const sourceSql = (filter: StatsFilter, column = 'session'): string => {
  if (filter.source === 'ide') return ` AND ${column} IN (${IDE_SESSIONS})`
  if (filter.source === 'outside') return ` AND ${column} NOT IN (${IDE_SESSIONS})`

  return ''
}

const projectSql = (filter: StatsFilter, column = 'place'): string =>
  filter.project === null
    ? ''
    : ` AND ${column} IN (SELECT id FROM places WHERE project = :project)`

const projectParams = (filter: StatsFilter): Record<string, string> =>
  filter.project === null ? {} : { project: filter.project }

/** Записи агентов (ответы, правки, вызовы, сообщения, решения) с временем в ts. */
export const agentWhere = (scope: Scope, time = 'ts'): Where => ({
  sql: `${time} >= :from AND ${time} < :to${sourceSql(scope.filter)}${projectSql(scope.filter)}`,
  params: { from: scope.from, to: scope.to, ...projectParams(scope.filter) },
})

/** Ходы, задевающие период (обрезаются потом в JS). */
export const turnWhere = (scope: Scope): Where => ({
  sql: `ended_at > :from AND started_at < :to${sourceSql(scope.filter)}${projectSql(scope.filter)}`,
  params: { from: scope.from, to: scope.to, ...projectParams(scope.filter) },
})

/**
 * Записи человека (присутствие, правки руками) по минутам. Источник их не делит: человек в
 * окне один, «вне IDE» его просто нет.
 */
export const humanWhere = (scope: Scope): Where => ({
  sql: `minute >= :fromMinute AND minute < :toMinute${projectSql(scope.filter)}`,
  params: {
    fromMinute: Math.floor(scope.from / MINUTE_MS),
    toMinute: Math.ceil(scope.to / MINUTE_MS),
    ...projectParams(scope.filter),
  },
})

/** Прогоны сценариев - всегда в IDE: «вне IDE» их нет. */
export const scenarioWhere = (scope: Scope): Where => ({
  sql: `started_at >= :from AND started_at < :to${
    scope.filter.source === 'outside' ? ' AND 0' : ''
  }${projectSql(scope.filter)}`,
  params: { from: scope.from, to: scope.to, ...projectParams(scope.filter) },
})

/** Сообщения человека: без шагов сценариев - их пишет движок, а не человек. */
export const HUMAN_PROMPTS =
  "human = 1 AND session NOT IN (SELECT id FROM sessions WHERE ide_kind = 'scenario')"
