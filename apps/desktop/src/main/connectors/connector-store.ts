import { isAbsolute } from 'node:path'

import type { ConnectorAvailability } from '@shared/connector-availability'
import { EVERYWHERE } from '@shared/connector-availability'
import type { HttpConnectorSpec } from '@shared/connector-spec'
import type {
  McpAuth,
  CustomKind,
  ToolAccess,
  McpTransport,
  ConnectorKind,
} from '@shared/connectors'
import {
  MCP_AUTHS,
  runsCommand,
  CUSTOM_KINDS,
  isCustomKind,
  MCP_TRANSPORTS,
  CONNECTOR_KINDS,
  CONNECTOR_DESCRIPTION_MAX,
} from '@shared/connectors'

import { isAllowedMcpUrl } from './connector-url'
import { parseSpec } from './kinds/http/http-spec'

/** Инструмент, как его отдал сервис в последний раз: окно видит список и без подключения. */
export type StoredTool = {
  name: string
  description: string
  access: ToolAccess
}

/** Коннектор в реестре. Секретов здесь нет - они в хранилище (vault.ts) по id. */
export type StoredConnector = {
  id: string
  kind: ConnectorKind
  /** Свой тип (ADR 0034); у встроенных - null. */
  typeId: string | null
  /** Подпись подключения; у своего типа, который подключают один раз, - пусто. */
  label: string
  /** Описание человека: что это и зачем. Модель получает его в пояснении сервера. */
  description: string
  serverName: string
  /** Адрес своего MCP-сервера; у остальных типов - null. */
  url: string | null
  /** Вход своего MCP-сервера; у остальных типов - null. */
  auth: McpAuth | null
  /** Протокол своего MCP-сервера; у остальных типов - null. */
  transport: McpTransport | null
  /**
   * Команда MCP-сервера на этой машине (command). Аргументы с ключом - маской: полная
   * команда тогда в хранилище (secrets.command). cwd - папка запуска (свой сервер проекта
   * из .mcp.json - в папке проекта, как у Claude Code); null - домашняя.
   */
  command: StoredCommand | null
  /** Описание коннектора от ИИ (http). */
  spec: HttpConnectorSpec | null
  /** В каких проектах коннектор виден провайдеру. */
  availability: ConnectorAvailability
  account: string | null
  enabled: boolean
  /** Выбор человека по инструментам; нет записи - как по умолчанию (tool-access.ts). */
  toolOverrides: Record<string, boolean>
  tools: StoredTool[]
}

export type StoredCommand = { command: string; args: string[]; cwd: string | null }

/**
 * Свой тип в реестре (ADR 0034): имя, «несколько раз», начало имён серверов и то, чем он
 * работает, - образец для новых подключений: каждое получает копию и живёт само по себе.
 * Секреты образца (ключи команды, адреса, заголовков) - в хранилище под ключом типа.
 */
export type StoredType = Pick<
  StoredConnector,
  'url' | 'auth' | 'transport' | 'command' | 'spec'
> & {
  id: string
  kind: CustomKind
  name: string
  multiple: boolean
  /**
   * Начало имён серверов: playwright - у подключений playwright-1 и playwright-2, у типа
   * «один раз» - имя сервера целиком. Ставится при создании и не меняется с именем: на имена
   * серверов опираются правила и хуки человека.
   */
  serverBase: string
}

export type StoredConnectors = {
  connectors: StoredConnector[]
  types: StoredType[]
  /** Клиент OAuth Google; ключ клиента - в хранилище секретов. */
  googleClientId: string | null
}

/** Коннектор без адреса, команды, описания и входа: остальное добавляет его тип. */
export const blankConnector = (
  base: Pick<StoredConnector, 'id' | 'kind' | 'label' | 'serverName'>,
): StoredConnector => ({
  ...base,
  typeId: null,
  description: '',
  url: null,
  auth: null,
  transport: null,
  command: null,
  spec: null,
  availability: EVERYWHERE,
  account: null,
  enabled: true,
  toolOverrides: {},
  tools: [],
})

const ACCESSES: readonly ToolAccess[] = ['read', 'write', 'outbound']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringOr = <T>(value: unknown, fallback: T): string | T =>
  typeof value === 'string' ? value : fallback

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
  typeof value === 'string' && allowed.includes(value as T) ? (value as T) : null

const parseTool = (value: unknown): StoredTool | null => {
  if (!isRecord(value) || typeof value['name'] !== 'string') return null

  return {
    name: value['name'],
    description: stringOr(value['description'], ''),
    access: oneOf(value['access'], ACCESSES) ?? 'write',
  }
}

const parseOverrides = (value: unknown): Record<string, boolean> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, boolean] => {
          return typeof entry[1] === 'boolean'
        }),
      )
    : {}

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/**
 * Вход по адресу: у своего MCP - записанный (по умолчанию в браузере), у Todoist - всегда
 * токен (ADR 0036), у остальных типов способа входа по адресу нет.
 */
const authOf = (kind: ConnectorKind, value: unknown): McpAuth | null => {
  if (kind === 'todoist') return 'token'

  return kind === 'mcp' ? (oneOf(value, MCP_AUTHS) ?? 'oauth') : null
}

/** Доступность из файла; нет или битая - во всех проектах. */
const parseAvailability = (value: unknown): ConnectorAvailability =>
  isRecord(value) && value['mode'] === 'only'
    ? { mode: 'only', projects: stringList(value['projects']) }
    : EVERYWHERE

const parseCommand = (value: unknown): StoredCommand | null =>
  isRecord(value) && typeof value['command'] === 'string' && value['command']
    ? {
        command: value['command'],
        args: stringList(value['args']),
        cwd: typeof value['cwd'] === 'string' && isAbsolute(value['cwd']) ? value['cwd'] : null,
      }
    : null

const parseConnector = (value: unknown): StoredConnector | null => {
  if (!isRecord(value)) return null

  const kind = oneOf(value['kind'], CONNECTOR_KINDS)
  const { id, label, serverName } = value

  if (!kind || typeof id !== 'string' || typeof label !== 'string') return null

  if (typeof serverName !== 'string') return null

  return {
    id,
    kind,
    typeId: isCustomKind(kind) ? stringOr(value['typeId'], null) : null,
    label,
    description: stringOr(value['description'], '').slice(0, CONNECTOR_DESCRIPTION_MAX),
    serverName,
    url: kind === 'mcp' ? stringOr(value['url'], null) : null,
    auth: authOf(kind, value['auth']),
    transport: kind === 'mcp' ? (oneOf(value['transport'], MCP_TRANSPORTS) ?? 'http') : null,
    command: runsCommand(kind) ? parseCommand(value['command']) : null,
    // Описание проверяется заново: файл мог править кто угодно, а шлюз его исполняет.
    spec: kind === 'http' ? parseSpec(value['spec']) : null,
    availability: parseAvailability(value['availability']),
    account: stringOr(value['account'], null),
    enabled: value['enabled'] !== false,
    toolOverrides: parseOverrides(value['toolOverrides']),
    tools: Array.isArray(value['tools'])
      ? value['tools'].map(parseTool).filter((tool) => tool !== null)
      : [],
  }
}

/** Свой тип с диска: без имени, начала имён серверов или того, чем работает, - пропуск. */
const parseType = (value: unknown): StoredType | null => {
  if (!isRecord(value)) return null

  const kind = oneOf(value['kind'], CUSTOM_KINDS)
  const { id, name, serverBase } = value

  if (!kind || typeof id !== 'string' || typeof name !== 'string' || !name.trim()) return null

  if (typeof serverBase !== 'string' || !serverBase) return null

  const type: StoredType = {
    id,
    kind,
    name,
    multiple: value['multiple'] === true,
    serverBase,
    url: kind === 'mcp' ? stringOr(value['url'], null) : null,
    auth: kind === 'mcp' ? (oneOf(value['auth'], MCP_AUTHS) ?? 'oauth') : null,
    transport: kind === 'mcp' ? (oneOf(value['transport'], MCP_TRANSPORTS) ?? 'http') : null,
    command: kind === 'command' ? parseCommand(value['command']) : null,
    spec: kind === 'http' ? parseSpec(value['spec']) : null,
  }

  return hasDefinition(type) ? type : null
}

/** Есть, чем работать: годный адрес своего MCP, команда, описание от ИИ. */
const hasDefinition = (item: Pick<StoredConnector, 'kind' | 'url' | 'command' | 'spec'>) => {
  if (item.kind === 'mcp') return isAllowedMcpUrl(item.url ?? '')

  if (runsCommand(item.kind)) return Boolean(item.command)

  return item.kind !== 'http' || Boolean(item.spec)
}

/**
 * Реестр с диска. Битая запись пропускается, а не роняет все: файл мог писать человек
 * руками. Повтор имени сервера отбрасывается - у провайдера два сервера с одним именем
 * не уживутся. Свой MCP без годного адреса (https или http своей машины), команда без
 * команды и описание от ИИ, не прошедшее проверку, тоже отбрасываются: с ними не работать,
 * а окно не должно падать на разборе.
 */
export const parseStoredConnectors = (value: unknown): StoredConnectors => {
  const record = isRecord(value) ? value : {}
  const seen = new Set<string>()
  const connectors = (Array.isArray(record['connectors']) ? record['connectors'] : [])
    .map(parseConnector)
    .filter((connector): connector is StoredConnector => {
      if (!connector || seen.has(connector.serverName) || !hasDefinition(connector)) return false

      seen.add(connector.serverName)

      return true
    })
  const types = (Array.isArray(record['types']) ? record['types'] : [])
    .map(parseType)
    .filter((type): type is StoredType => type !== null)
  const typeIds = new Set(types.map((type) => type.id))

  return {
    // Ссылка на тип, которого нет, - как будто типа ещё не было: перенос
    // (assignCustomTypes) даст коннектору новый.
    connectors: connectors.map((connector) =>
      connector.typeId && !typeIds.has(connector.typeId)
        ? { ...connector, typeId: null }
        : connector,
    ),
    types,
    googleClientId: stringOr(record['googleClientId'], null),
  }
}
