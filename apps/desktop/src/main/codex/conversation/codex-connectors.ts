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
 * Имена серверов шлюза в процессе Codex: имя в шлюзе → имя у Codex. Таблица флага `-c` не
 * заменяет одноимённый сервер из конфига человека, а сливается с ним: адрес шлюза рядом с его
 * командой Codex отвергает («url is not supported for stdio») и не открывает разговор вовсе, а
 * серверу по адресу достались бы его заголовки и списки инструментов. Поэтому занятое имя
 * получает хвост `-ide`: тип в начале имени остаётся, по нему хуки узнают отправку.
 */
export const codexServerNames = (
  servers: readonly GatewayEntry[],
  userServers: readonly UserServer[],
): Map<string, string> => {
  const theirs = new Set(userServers.map((server) => server.name))
  const used = new Set(servers.map((server) => server.name).filter((name) => !theirs.has(name)))
  const names = new Map<string, string>()

  for (const { name } of servers) {
    let free = name

    for (let count = 1; theirs.has(free) || (free !== name && used.has(free)); count += 1) {
      free = count === 1 ? `${name}-ide` : `${name}-ide-${count}`
    }

    used.add(free)
    names.set(name, free)
  }

  return names
}

/** Что процессу Codex можно без вопроса и что видно у серверов шлюза. */
export type ConnectorOptions = {
  /** Только эти инструменты сервера шлюза (`enabled_tools`); сервер без своих не идёт вовсе. */
  onlyTools?: ReadonlyMap<string, readonly string[]> | undefined
  /**
   * Разовый вопрос без человека: выданное (допуск шлюза, ADR 0114, или чтение проекта) Codex
   * не спрашивает (`default_tools_approval_mode`). Без этого в never с песочницей только
   * чтения он отказал бы всему без пометки «только чтение» (ADR 0131).
   */
  approved?: boolean | undefined
  /**
   * Правила «разрешено всегда» шлюза (`GatewayLaunch.allowed`, у Claude - `--allowedTools`):
   * `mcp__<сервер>` - весь сервер, `mcp__<сервер>__<инструмент>` - один инструмент. Уведомления
   * себе и свои серверы IDE Codex, как и Claude, не спрашивает.
   */
  allowed?: readonly string[] | undefined
}

/**
 * Одобрение без вопроса у сервера шлюза по правилам: весь сервер или инструменты. Правило
 * принадлежит серверу с самым длинным подходящим именем: `mcp__a__b__x` - инструмент `x`
 * сервера `a__b`, а не `b__x` сервера `a`.
 */
const approvalsOf = (
  name: string,
  servers: readonly GatewayEntry[],
  allowed: readonly string[],
) => {
  const longer = servers
    .map((server) => server.name)
    .filter((other) => other.length > name.length && other.startsWith(`${name}__`))
  const tools = allowed.flatMap((rule) => {
    const prefix = `mcp__${name}__`

    if (!rule.startsWith(prefix)) return []
    if (longer.some((other) => rule === `mcp__${other}` || rule.startsWith(`mcp__${other}__`))) {
      return []
    }

    return [rule.slice(prefix.length)]
  })

  return { all: allowed.includes(`mcp__${name}`), tools }
}

/** Хвост таблицы сервера про одобрение: весь сервер или поимённо (`tools.<имя>.approval_mode`). */
const approvalFields = (all: boolean, tools: readonly string[]): string => {
  if (all) return ', default_tools_approval_mode="approve"'
  if (tools.length === 0) return ''

  const table = tools.map((tool) => `${JSON.stringify(tool)}={approval_mode="approve"}`).join(', ')

  return `, tools={${table}}`
}

/**
 * Флаги `-c` процесса Codex (ADR 0029: MCP у провайдера - только коннекторы IDE): серверы
 * шлюза проекта с ключом из окружения - под именами `codexServerNames` - и выключенные серверы
 * человека из его конфига Codex, все до одного: конфиг не правится, выключение действует
 * только на процессы IDE. Сервер - целиком одной встроенной таблицей с транспортом: таблицу
 * без него Codex отвергал («invalid transport»). Об остальном Codex спрашивает одобрения
 * вопросом (codex-mcp-approval.ts).
 */
export const connectorArgs = (
  servers: readonly GatewayEntry[],
  userServers: readonly UserServer[],
  { onlyTools, approved = false, allowed = [] }: ConnectorOptions = {},
): string[] => {
  const names = codexServerNames(servers, userServers)

  return [
    ...servers.flatMap((server) => {
      const name = names.get(server.name) ?? server.name
      const tools = onlyTools?.get(server.name)

      if ((onlyTools && !tools) || !named(name)) return []

      const only = tools ? `, enabled_tools=${JSON.stringify(tools)}` : ''
      const rules = approvalsOf(server.name, servers, allowed)
      const approve = approvalFields(approved || rules.all, rules.tools)

      return [
        '-c',
        `mcp_servers.${name}={url=${JSON.stringify(server.url)}, bearer_token_env_var="${GATEWAY_TOKEN_ENV}"${only}${approve}}`,
      ]
    }),
    ...userServers
      .filter((server) => named(server.name))
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
