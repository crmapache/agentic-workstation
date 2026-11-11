import type { ImportBlock, ImportCandidate } from '@shared/connectors'

import { serverNameFor } from '../connector-names'
import { maskUrl, maskArgs } from '../../claude/tools/secret-mask'
import { SECRET_MASK } from '../../claude/tools/tools.constants'

/** Сервер из конфига Claude Code, как он там записан. */
export type RawServer = {
  type?: unknown
  command?: unknown
  args?: unknown
  env?: unknown
  url?: unknown
  headers?: unknown
}

/** Найденный сервер: где он настроен и как его прочитать. */
export type FoundServer = {
  candidate: ImportCandidate
  server: RawServer
}

/** Решения Claude Code о серверах .mcp.json проекта: одобренные, отклонённые, «все». */
export type McpJsonApprovals = {
  enabled: ReadonlySet<string>
  disabled: ReadonlySet<string>
  all: boolean
}

/**
 * Что прочитано у открытого проекта: свои серверы человека из ~/.claude.json (local) и
 * .mcp.json - только если папка доверена (иначе null: чужой репозиторий мог подложить
 * туда любую команду).
 */
export type ProjectServers = {
  path: string
  local: unknown
  mcpJson: unknown
  approvals: McpJsonApprovals
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

export const stringMap = (value: unknown): Record<string, string> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, string] => {
          return typeof entry[1] === 'string'
        }),
      )
    : {}

/** Вид сервера: команда (stdio) или адрес (http, sse); остальное IDE не возьмёт. */
const kindOf = (server: RawServer): 'command' | 'mcp' | null => {
  if (typeof server.command === 'string' && server.command && server.type !== 'http') {
    return 'command'
  }

  return typeof server.url === 'string' && (server.type === 'http' || server.type === 'sse')
    ? 'mcp'
    : null
}

/**
 * Что запустится или куда пойдёт запрос - для решения человека. У команды видны и имена её
 * переменных окружения (значения - маской): сервер из репозитория мог бы спрятать в них
 * что угодно.
 */
const targetOf = (server: RawServer, kind: 'command' | 'mcp'): string =>
  kind === 'command'
    ? [
        ...Object.keys(stringMap(server.env)).map((name) => `${name}=${SECRET_MASK}`),
        String(server.command),
        ...maskArgs(strings(server.args)),
      ].join(' ')
    : maskUrl(String(server.url))

/** Свой вход заголовками (Authorization, X-API-Key…): без них сервер был на OAuth Claude Code. */
export const hasHeaders = (server: RawServer): boolean =>
  Object.keys(stringMap(server.headers)).length > 0

type Source = {
  scope: ImportCandidate['scope']
  projectPath: string | null
  servers: unknown
  approvals: McpJsonApprovals | null
}

/**
 * Серверы из конфига Claude Code: общие для человека (user), свои для открытых проектов
 * (local, в ~/.claude.json) и проектные (.mcp.json доверенной папки, кроме отклонённых в
 * Claude Code). Имя коннектора - то же, а если IDE его меняет (знаки вне латиницы, длина),
 * это видно в списке: на имя опираются правила и хуки человека (mcp__chatkepr__…). Занятое
 * имя и повтор внутри списка помечены.
 */
export const findServers = (
  userConfig: unknown,
  projects: readonly ProjectServers[],
  taken: ReadonlySet<string>,
): FoundServer[] => {
  const user = isRecord(userConfig) ? userConfig : {}
  const sources: Source[] = [
    { scope: 'user', projectPath: null, servers: user['mcpServers'], approvals: null },
    ...projects.flatMap(({ path, local, mcpJson, approvals }): Source[] => [
      { scope: 'local', projectPath: path, servers: local, approvals: null },
      {
        scope: 'project',
        projectPath: path,
        servers: isRecord(mcpJson) ? mcpJson['mcpServers'] : null,
        approvals,
      },
    ]),
  ]
  const offered = new Set<string>()

  return sources.flatMap(({ scope, projectPath, servers, approvals }) =>
    Object.entries(isRecord(servers) ? servers : {}).flatMap(([name, value]) => {
      const server = (isRecord(value) ? value : {}) as RawServer
      const kind = kindOf(server)

      if (!kind || approvals?.disabled.has(name)) return []

      const serverName = serverNameFor(kind, name) ?? ''
      let blocked: ImportBlock | null = null

      if (!serverName) blocked = 'bad-name'
      else if (taken.has(serverName)) blocked = 'taken'
      else if (offered.has(serverName)) blocked = 'duplicate'

      offered.add(serverName)

      return [
        {
          server,
          candidate: {
            key: `${scope}:${projectPath ?? ''}:${name}`,
            name,
            serverName,
            kind,
            target: targetOf(server, kind),
            scope,
            projectPath,
            needsSignIn: kind === 'mcp' && !hasHeaders(server),
            blocked,
            pending: approvals !== null && !approvals.all && !approvals.enabled.has(name),
          },
        },
      ]
    }),
  )
}
