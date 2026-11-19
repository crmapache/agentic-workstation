import { runQuiet } from '../../process/binary-locator'
import type { Environment } from '../../process/shell-env'
import type { GatewayEntry } from '../../connectors/gateway/mcp-config'

/** Переменная окружения процесса Codex с ключом шлюза IDE: в флагах и журналах ключа нет. */
export const GATEWAY_TOKEN_ENV = 'AGENTIC_WORKSTATION_GATEWAY_TOKEN'

/** Имя сервера, которое можно назвать в пути `-c` (разбивается по точкам): латиница, цифры, - и _. */
const SAFE_NAME = /^[A-Za-z0-9_-]+$/

/** Свой MCP-сервер человека из конфига Codex: имя и транспорт полями TOML (адрес или команда). */
export type UserServer = { name: string; transport: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/** Транспорт полями встроенной таблицы TOML: без него Codex не примет даже выключенный сервер. */
const transportOf = (transport: unknown): string | null => {
  if (!isRecord(transport)) return null

  const { url, command } = transport

  if (typeof url === 'string' && url) return `url=${JSON.stringify(url)}`
  if (typeof command === 'string' && command) {
    return `command=${JSON.stringify(command)}, args=${JSON.stringify(strings(transport['args']))}`
  }

  return null
}

/** Список `codex mcp list --json` - свои серверы человека; не список (сбой, мусор) - null. */
export const userServersOf = (json: string): UserServer[] | null => {
  try {
    const list: unknown = JSON.parse(json)

    if (!Array.isArray(list)) return null

    return list.filter(isRecord).flatMap((entry) => {
      const transport = transportOf(entry['transport'])

      return typeof entry['name'] === 'string' && transport
        ? [{ name: entry['name'], transport }]
        : []
    })
  } catch {
    return null
  }
}

const named = (name: string) => {
  if (SAFE_NAME.test(name)) return true

  console.warn('[codex] сервер MCP с таким именем флагом не назвать:', name)

  return false
}

/**
 * Флаги `-c` процесса Codex (ADR 0029: MCP у провайдера - только коннекторы IDE): серверы
 * шлюза проекта с ключом из окружения и выключенные серверы человека из его конфига Codex -
 * конфиг не правится, выключение действует только на процессы IDE. Сервер - целиком одной
 * встроенной таблицей: флаг пути внутри сервера заменяет его таблицу, и Codex отвергает
 * сервер без транспорта («invalid transport»).
 */
export const connectorArgs = (
  servers: readonly GatewayEntry[],
  userServers: readonly UserServer[],
): string[] => {
  const ours = new Set(servers.map((server) => server.name))

  return [
    ...servers
      .filter((server) => named(server.name))
      .flatMap((server) => [
        '-c',
        `mcp_servers.${server.name}={url=${JSON.stringify(server.url)}, bearer_token_env_var="${GATEWAY_TOKEN_ENV}"}`,
      ]),
    ...userServers
      .filter((server) => !ours.has(server.name) && named(server.name))
      .flatMap((server) => [
        '-c',
        `mcp_servers.${server.name}={${server.transport}, enabled=false}`,
      ]),
  ]
}

/**
 * Свои серверы MCP человека из его настроек Codex (`codex mcp list --json`). Выключить их
 * можно только поимённо (весь раздел флагом не заменить): не прочитались - null. Разговор
 * панели поднимется и с ними, рядом с коннекторами IDE; разовый вопрос без человека - нет.
 */
export const readUserServers = async (
  cli: { binary: string; env: Environment } | null,
): Promise<UserServer[] | null> => {
  if (!cli) return []

  const servers = userServersOf(await runQuiet(cli.binary, ['mcp', 'list', '--json'], cli.env))

  if (!servers) console.warn('[codex] свои серверы MCP не прочитались, они не выключены')

  return servers
}
