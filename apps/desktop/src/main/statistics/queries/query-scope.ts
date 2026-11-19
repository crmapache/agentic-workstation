import type { StatsFilter } from '@shared/statistics'
import { MINUTE_MS } from '@shared/time-units'

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

/** Провайдер записи - у её сессии: id у провайдеров свои, сессия - пара (провайдер, id). */
const providerSql = (filter: StatsFilter, column = 'session'): string =>
  filter.provider === 'all'
    ? ''
    : ` AND ${column} IN (SELECT id FROM sessions WHERE provider = :provider)`

const projectSql = (filter: StatsFilter, column = 'place'): string =>
  filter.project === null
    ? ''
    : ` AND ${column} IN (SELECT id FROM places WHERE project = :project)`

const filterParams = (filter: StatsFilter): Record<string, string> => ({
  ...(filter.project !== null && { project: filter.project }),
  ...(filter.provider !== 'all' && { provider: filter.provider }),
})

/** Источник, провайдер и проект записи агента - одним куском WHERE. */
const agentFilterSql = (filter: StatsFilter): string =>
  `${sourceSql(filter)}${providerSql(filter)}${projectSql(filter)}`

/** Записи агентов (ответы, правки, вызовы, сообщения, решения) с временем в ts. */
export const agentWhere = (scope: Scope, time = 'ts'): Where => ({
  sql: `${time} >= :from AND ${time} < :to${agentFilterSql(scope.filter)}`,
  params: { from: scope.from, to: scope.to, ...filterParams(scope.filter) },
})

/** Ходы, задевающие период (обрезаются потом в JS). */
export const turnWhere = (scope: Scope): Where => ({
  sql: `ended_at > :from AND started_at < :to${agentFilterSql(scope.filter)}`,
  params: { from: scope.from, to: scope.to, ...filterParams(scope.filter) },
})

/**
 * Записи человека (присутствие, правки руками) по минутам. Источник и провайдер их не делят:
 * человек в окне один, «вне IDE» его просто нет, и работает он не в провайдере.
 */
export const humanWhere = (scope: Scope): Where => ({
  sql: `minute >= :fromMinute AND minute < :toMinute${projectSql(scope.filter)}`,
  params: {
    fromMinute: Math.floor(scope.from / MINUTE_MS),
    toMinute: Math.ceil(scope.to / MINUTE_MS),
    ...(scope.filter.project !== null && { project: scope.filter.project }),
  },
})

/** Прогоны сценариев - всегда в IDE: «вне IDE» их нет. Провайдер - свой у прогона. */
export const scenarioWhere = (scope: Scope): Where => ({
  sql: `started_at >= :from AND started_at < :to${
    scope.filter.source === 'outside' ? ' AND 0' : ''
  }${scope.filter.provider === 'all' ? '' : ' AND provider = :provider'}${projectSql(scope.filter)}`,
  params: { from: scope.from, to: scope.to, ...filterParams(scope.filter) },
})

/** Сообщения человека: без шагов сценариев и прогонов заданий - их пишет IDE, а не человек. */
export const HUMAN_PROMPTS =
  "human = 1 AND session NOT IN (SELECT id FROM sessions WHERE ide_kind IN ('scenario', 'task'))"
