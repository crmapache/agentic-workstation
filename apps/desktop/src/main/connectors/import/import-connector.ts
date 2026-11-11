import { EVERYWHERE } from '@shared/connector-availability'
import type { McpAuth, ImportSkipReason } from '@shared/connectors'

import type { ShellVariables } from '../command-line'
import type { NewConnector } from '../connector-add'
import { commandForStore } from '../connector-command'
import { definitionSecrets } from '../connector-secrets'
import type { ConnectorSecrets } from '../connector-secrets'
import { blankConnector } from '../connector-store'
import { typeFrom, titleName, capitalized } from '../connector-types'
import { publicUrl, hasSecretParts, isAllowedMcpUrl } from '../connector-url'
import { strings, stringMap } from './import-candidates'
import type { FoundServer } from './import-candidates'
import { expandConfigMap, MissingVariable, expandConfigVariables } from './import-vars'

const BEARER = /^Bearer\s+(.+)$/i

/**
 * Вход сервера по адресу из его заголовков: Authorization Bearer - ключ, остальные
 * заголовки - как есть в секреты.
 */
const headerSecrets = (
  headers: Record<string, string>,
): { bearer: string | null; rest: Record<string, string> } => {
  const entries = Object.entries(headers)
  const authorization = entries.find(([name]) => name.toLowerCase() === 'authorization')
  const bearer = authorization ? (BEARER.exec(authorization[1])?.[1] ?? null) : null
  const rest = Object.fromEntries(
    entries.filter(([name]) => !(bearer && name.toLowerCase() === 'authorization')),
  )

  return { bearer, rest }
}

const commandConnector = (
  base: NewConnector['connector'],
  { candidate, server }: FoundServer,
  env: ShellVariables,
): NewConnector => {
  const shown = { command: String(server.command), args: strings(server.args) }
  const launch = {
    command: expandConfigVariables(shown.command, env),
    args: shown.args.map((arg) => expandConfigVariables(arg, env)),
  }
  const variables = expandConfigMap(stringMap(server.env), env)
  // Свой сервер проекта Claude Code запускает из папки проекта: «./mcp/server.js» - от неё.
  const { stored, secret } = commandForStore(launch, shown, candidate.projectPath)

  return {
    connector: { ...base, command: stored },
    secrets: {
      ...(Object.keys(variables).length ? { env: variables } : {}),
      ...(secret ? { command: secret } : {}),
    },
  }
}

/**
 * Коннектор из найденного сервера. Переменные ${NAME} раскрываются из окружения оболочки,
 * как у Claude Code; ключи (env команды, заголовки, адрес с ключом, аргументы с ключом) -
 * в секреты, в реестре - без них. Общий для человека сервер виден во всех проектах, свой
 * для проекта - только в нём. probedAuth - что показала проба сервера по адресу без
 * заголовков: oauth - он просит вход, none - пускает так; у сервера с заголовками входа
 * пробы нет. Не взять - причина кодом.
 */
export const importedConnector = (
  found: FoundServer,
  id: string,
  probedAuth: McpAuth,
  env: ShellVariables,
): NewConnector | ImportSkipReason => {
  const { candidate, server } = found

  if (!candidate.serverName || candidate.blocked) return 'taken'

  const base = {
    ...blankConnector({
      id,
      kind: candidate.kind,
      label: candidate.name,
      serverName: candidate.serverName,
    }),
    availability: candidate.projectPath
      ? { mode: 'only' as const, projects: [candidate.projectPath] }
      : EVERYWHERE,
  }

  try {
    if (candidate.kind === 'command') return commandConnector(base, found, env)

    const url = expandConfigVariables(String(server.url), env)

    if (!isAllowedMcpUrl(url)) return 'failed'

    const { bearer, rest } = headerSecrets(expandConfigMap(stringMap(server.headers), env))
    const secrets: ConnectorSecrets = {
      ...(bearer ? { bearer } : {}),
      ...(Object.keys(rest).length ? { headers: rest } : {}),
      ...(hasSecretParts(url) ? { url } : {}),
    }

    return {
      connector: {
        ...base,
        url: publicUrl(url),
        auth: bearer ? 'token' : Object.keys(rest).length ? 'none' : probedAuth,
        transport: server.type === 'sse' ? 'sse' : 'http',
      },
      secrets,
    }
  } catch (error) {
    if (error instanceof MissingVariable) return 'variable'

    throw error
  }
}

/**
 * Свой тип импортированного сервера (ADR 0034). В группе (playwright-1 и playwright-2
 * работают одинаково) - тип «несколько раз» по началу имени, подпись - конец имени; тип
 * группы заводит первый перенесённый сервер (typeId - null), остальные встают к нему.
 * Один - тип «один раз» с именем из имени сервера. Имя сервера не меняется.
 */
export const withImportType = (
  prepared: NewConnector,
  group: { base: string; label: string } | null,
  typing: { typeId: string; existing: boolean },
): NewConnector => {
  const { connector, secrets } = prepared
  const typed = {
    ...connector,
    typeId: typing.typeId,
    label: group ? capitalized(group.label) : '',
  }

  if (typing.existing) return { connector: typed, secrets }

  const stored = typeFrom(typed, {
    id: typing.typeId,
    name: titleName(group ? group.base : connector.label),
    multiple: Boolean(group),
    serverBase: group ? group.base : connector.serverName,
  })

  return stored
    ? { connector: typed, secrets, type: { stored, secrets: definitionSecrets(secrets) } }
    : prepared
}
