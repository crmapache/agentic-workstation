import type {
  Connector,
  ConnectorTool,
  ConnectorStatus,
  ConnectorFailure,
} from '@shared/connectors'

import { maskArgs } from '../claude/tools/secret-mask'
import type { StoredTool, StoredType, StoredConnector } from './connector-store'
import type { ServiceAnswer } from './service-answer'
import { isToolEnabled } from './tool-access'
import { signsInWithBrowser } from './kinds/sources'
import { BROWSER_GUIDE, BROWSER_COMPUTER_NOTE } from './kinds/browser/browser-guide'
import { COMPUTER_GUIDE } from './kinds/computer/computer-guide'

/** Что о коннекторе знает только живая IDE: идёт ли вход и чем кончилась последняя попытка. */
export type LiveFacts = {
  signedIn: boolean
  signingIn: boolean
  failure: ConnectorFailure | null
  /** Что ответил сервис о сбое: его слова и страница, где чинить (service-answer.ts). */
  said?: ServiceAnswer | null | undefined
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
    inProjects: connector.inProjects,
    auth: connector.auth,
    takesToken:
      connector.auth === 'token' ||
      (connector.kind === 'http' && connector.spec?.auth.type !== 'none'),
    enabled: connector.enabled,
    signsIn: signsInWithBrowser(connector),
    signedIn: live.signedIn,
    status: statusOf(connector, live),
    failure: connector.enabled ? live.failure : null,
    failureDetail: (connector.enabled && live.said?.detail) || null,
    failureUrl: (connector.enabled && live.said?.url) || null,
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
  computer: "the user's computer (real mouse, keyboard and screen)",
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

/** Как работать с коннектором, когда это не видно из самих инструментов. */
const KIND_GUIDE: Partial<Record<StoredConnector['kind'], string>> = {
  browser: BROWSER_GUIDE,
  computer: COMPUTER_GUIDE,
}

/**
 * Заметки о соседях: коннектор говорит модели о другом, только если тот есть в проекте. Browser
 * отдаёт Computer Use то, куда Chrome не пускает расширение (ADR 0057).
 */
const NEIGHBOUR_NOTES: Partial<
  Record<StoredConnector['kind'], Partial<Record<StoredConnector['kind'], string>>>
> = { browser: { computer: BROWSER_COMPUTER_NOTE } }

const neighbourNotes = (
  kind: StoredConnector['kind'],
  neighbours: readonly StoredConnector['kind'][],
): string[] => {
  const notes = NEIGHBOUR_NOTES[kind] ?? {}

  return [...new Set(neighbours)].flatMap((other) => notes[other] ?? [])
}

/**
 * Что человек сказал про коннектор в проекте разговора (ADR 0053): профиль Chrome у Browser и
 * его инструкции. Проекта у процесса нет или там ничего не сказано - пусто.
 */
const projectNotes = (connector: StoredConnector, projectPath: string | null): string[] => {
  const inProject = projectPath ? connector.inProjects[projectPath] : undefined
  const profile = connector.kind === 'browser' ? inProject?.browserProfile : null
  const instructions = inProject?.instructions.trim()

  return [
    profile
      ? `In this project, work in the Chrome profile "${profile}" unless the user names another one: it is the default when you don't pass "profile".`
      : '',
    instructions
      ? `The user's instructions for this connector in this project: ${instructions}`
      : '',
  ].filter(Boolean)
}

/**
 * Пояснение для модели при подключении к серверу: что это за коннектор, чей он, что
 * человек запретил, как с ним работать, как человек сам его описал и что сказал про него в
 * проекте разговора (projectPath), и что ему поручают соседние коннекторы проекта (neighbours).
 * Модель видит его у каждого сервера - по нему она отличает рабочую почту от своей, выбирает
 * нужный из похожих и не пытается обойти выключенную отправку. Claude Code режет пояснение до
 * 2048 знаков: слова человека идут раньше заметок о соседях, чтобы под нож уходили заметки.
 */
export const instructionsFor = (
  connector: StoredConnector,
  live: LiveFacts,
  name: string | null,
  projectPath: string | null = null,
  neighbours: readonly StoredConnector['kind'][] = [],
): string => {
  const isWorking = connector.enabled && live.signedIn
  const guide = isWorking ? KIND_GUIDE[connector.kind] : undefined
  const note = connector.description.trim()

  return [
    stateFor(connector, live, name),
    guide ?? '',
    note ? `The user describes this connector: ${note}` : '',
    ...(isWorking ? neighbourNotes(connector.kind, neighbours) : []),
    ...(isWorking ? projectNotes(connector, projectPath) : []),
  ]
    .filter(Boolean)
    .join('\n')
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
