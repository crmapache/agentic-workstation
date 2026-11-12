import type {
  Connector,
  ConnectorTool,
  ConnectorStatus,
  ConnectorFailure,
} from '@shared/connectors'

import { maskArgs } from '../claude/tools/secret-mask'
import type { StoredTool, StoredType, StoredConnector } from './connector-store'
import { isToolEnabled } from './tool-access'
import { signsInWithBrowser } from './kinds/sources'

/** Что о коннекторе знает только живая IDE: идёт ли вход и чем кончилась последняя попытка. */
export type LiveFacts = {
  signedIn: boolean
  signingIn: boolean
  failure: ConnectorFailure | null
  /**
   * Чей коннектор сейчас, когда это знает только живая IDE: у Browser - профили Chrome на
   * связи (ADR 0040). Нет - из реестра.
   */
  account?: string | null
}

/** Живого коннектора нет (только что удалён): ни входа, ни сбоя. */
export const NO_LIVE_FACTS: LiveFacts = { signedIn: false, signingIn: false, failure: null }

export const statusOf = (connector: StoredConnector, live: LiveFacts): ConnectorStatus => {
  if (!connector.enabled) return 'disabled'

  if (live.signingIn) return 'signing-in'

  if (!live.signedIn) return 'signed-out'

  return live.failure ? 'failed' : 'connected'
}

const toolsView = (connector: StoredConnector): ConnectorTool[] =>
  connector.tools.map((tool) => ({
    ...tool,
    enabled: isToolEnabled(tool.access, connector.toolOverrides[tool.name]),
  }))

/** Команда для окна: ключи в аргументах замаскированы - экран видят на демонстрации. */
const commandView = (connector: StoredConnector): string | null =>
  connector.command
    ? [connector.command.command, ...maskArgs(connector.command.args)].join(' ')
    : null

/**
 * Коннектор для окна. Адрес своего MCP в реестре уже без ключей (connector-url.ts), у
 * коннектора от ИИ адрес - базовый адрес сервиса из описания.
 */
export const connectorView = (
  connector: StoredConnector,
  live: LiveFacts,
  type: StoredType | null,
): Connector => {
  return {
    id: connector.id,
    kind: connector.kind,
    typeId: type?.id ?? null,
    name: type?.name ?? null,
    label: connector.label,
    description: connector.description,
    serverName: connector.serverName,
    account: live.account ?? connector.account,
    url: connector.spec?.baseUrl ?? connector.url,
    command: commandView(connector),
    service: connector.spec?.service ?? null,
    availability: connector.availability,
    auth: connector.auth,
    takesToken:
      connector.auth === 'token' ||
      (connector.kind === 'http' && connector.spec?.auth.type !== 'none'),
    enabled: connector.enabled,
    signsIn: signsInWithBrowser(connector),
    signedIn: live.signedIn,
    status: statusOf(connector, live),
    failure: connector.enabled ? live.failure : null,
    tools: toolsView(connector),
  }
}

/** Инструменты, которые модель увидит: включённые человеком или по умолчанию. */
export const enabledTools = <T extends Pick<StoredTool, 'name' | 'access'>>(
  tools: readonly T[],
  overrides: Record<string, boolean>,
): T[] => tools.filter((tool) => isToolEnabled(tool.access, overrides[tool.name]))

const SERVICE_NAME: Record<StoredConnector['kind'], string> = {
  gmail: 'Gmail mailbox',
  calendar: 'Google Calendar',
  notion: 'Notion workspace',
  slack: 'Slack workspace',
  atlassian: 'Jira and Confluence (Atlassian Cloud)',
  todoist: 'Todoist account',
  playwright: 'Playwright browser',
  browser: "the user's Chrome",
  mcp: 'MCP server',
  command: 'MCP server',
  http: 'API',
}

/**
 * Как коннектор назван на виде Connectors: имя своего типа и подпись (Playwright · 1), у
 * встроенного - подпись (Work), у своего «один раз» - имя. По нему модель отправляет
 * человека выключить или включить что-то.
 */
export const connectorTitle = (connector: StoredConnector, name: string | null): string =>
  [name, connector.label].filter(Boolean).join(' · ') || connector.serverName

/**
 * Что это за коннектор и в каком он состоянии - первая часть пояснения для модели. name -
 * имя своего типа (Playwright), у встроенных - null.
 */
const stateFor = (connector: StoredConnector, live: LiveFacts, name: string | null): string => {
  const owner = connector.account ? ` ${connector.account}` : ''
  const service = name ? `${name} (${SERVICE_NAME[connector.kind]})` : SERVICE_NAME[connector.kind]
  const label = connector.label ? ` ("${connector.label}")` : ''
  const head = `${service}${owner}${label}, connected through Agentic Workstation.`
  const where = `Agentic Workstation → Connectors → ${connectorTitle(connector, name)}`

  if (!connector.enabled) return `${head} The user turned this connector off in ${where}.`

  if (!live.signedIn) {
    return `${head} It is not signed in, so it has no tools. Ask the user to sign in: ${where}.`
  }

  const outboundOff = connector.tools.some(
    (tool) =>
      tool.access === 'outbound' && !isToolEnabled(tool.access, connector.toolOverrides[tool.name]),
  )

  return outboundOff
    ? `${head} Tools that send anything to other people are turned off by the user: prepare drafts and let the user send them.`
    : head
}

/**
 * Пояснение для модели при подключении к серверу: что это за коннектор, чей он, что
 * человек запретил и как сам его описал. Модель видит его у каждого сервера - по нему она
 * отличает рабочую почту от своей, выбирает нужный из похожих и не пытается обойти
 * выключенную отправку.
 */
export const instructionsFor = (
  connector: StoredConnector,
  live: LiveFacts,
  name: string | null,
): string => {
  const note = connector.description.trim()
  const about = note ? `\nThe user describes this connector: ${note}` : ''

  return `${stateFor(connector, live, name)}${about}`
}

/** Ответ модели на выключенный инструмент - чтобы она не искала обход. */
export const disabledToolText = (
  connector: StoredConnector,
  tool: StoredTool | undefined,
  name: string | null,
): string =>
  tool?.access === 'outbound'
    ? `Sending to other people is turned off for "${connectorTitle(connector, name)}" by the user. Prepare a draft and let the user send it.`
    : `This tool is turned off by the user in Agentic Workstation → Connectors → ${connectorTitle(connector, name)}.`
