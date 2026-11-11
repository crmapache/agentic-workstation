import type { ConnectorAvailability } from '@shared/connector-availability'
import { projectsIn } from '@shared/connector-availability'
import type { AiGeneration } from '@shared/connector-spec'
import type {
  Connector,
  ToolAccess,
  ConnectorKind,
  ConnectorTool,
  ConnectorsState,
  ImportCandidate,
  ConnectorFailure,
  AddConnectorRequest,
} from '@shared/connectors'
import type { ProjectRef, WorkspaceState } from '@shared/workspace'

import { ACCESS_ORDER, TOOL_DESCRIPTION_MAX } from './ConnectorsView.constants'
import type { FormKind, AddFormFields, GenerationBadge } from './ConnectorsView.types'

/** Инструменты по ступеням доступа, пустые группы не показываются. */
export const toolGroups = (
  tools: readonly ConnectorTool[],
): { access: ToolAccess; tools: ConnectorTool[] }[] =>
  ACCESS_ORDER.map((access) => ({
    access,
    tools: tools.filter((tool) => tool.access === access),
  })).filter((group) => group.tools.length > 0)

/** Первое предложение описания, не длиннее строки-двух: полное описание - для модели. */
export const shortDescription = (text: string): string => {
  const firstLine = text.trim().split('\n')[0] ?? ''
  const sentence = /^.*?[.!?](\s|$)/.exec(firstLine)?.[0].trim() ?? firstLine

  return sentence.length > TOOL_DESCRIPTION_MAX
    ? `${sentence.slice(0, TOOL_DESCRIPTION_MAX - 1).trimEnd()}…`
    : sentence
}

/** Просьба главному процессу из полей формы: каждому типу - только его поля. */
export const addRequest = (kind: FormKind, fields: AddFormFields): AddConnectorRequest => {
  const newType = { name: fields.name, multiple: fields.multiple, label: fields.label }

  if (kind === 'slack') {
    return {
      kind,
      label: fields.label,
      clientId: fields.clientId,
      clientSecret: fields.clientSecret,
    }
  }

  if (kind === 'todoist') return { kind, label: fields.label, token: fields.token }

  if (kind === 'playwright') {
    const { label, profile, profileDir, headless, version } = fields

    return { kind, label, profile, profileDir, headless, version }
  }

  if (kind === 'mcp') {
    return { kind, ...newType, url: fields.url, auth: fields.auth, token: fields.token }
  }

  if (kind === 'command') {
    return { kind, ...newType, commandLine: fields.commandLine, envLine: fields.envLine }
  }

  return { kind, label: fields.label }
}

/** Последняя часть пути: имя папки проекта, которого нет среди известных. */
export const folderName = (path: string): string => path.split('/').filter(Boolean).at(-1) ?? path

/**
 * Где коннектор виден - ключ подписи, число и имя. Один проект - по имени («Only in
 * web-tanks»): так плитка говорит больше, чем «в одном проекте».
 */
export const availabilitySummary = (
  availability: ConnectorAvailability,
  projects: readonly ProjectRef[],
): { key: 'all' | 'only' | 'onlyOne' | 'none'; count: number; name: string } => {
  if (availability.mode === 'all') return { key: 'all', count: 0, name: '' }

  const [single] = availability.projects

  if (availability.projects.length === 1 && single !== undefined) {
    const known = projects.find((project) => project.rootPath === single)

    return { key: 'onlyOne', count: 1, name: known?.name ?? folderName(single) }
  }

  return availability.projects.length
    ? { key: 'only', count: availability.projects.length, name: '' }
    : { key: 'none', count: 0, name: '' }
}

/** Вход этого коннектора будет в браузере: кнопка «добавить и войти», а не просто «добавить». */
export const signsInWithBrowser = (kind: ConnectorKind, fields: AddFormFields): boolean => {
  if (kind === 'command' || kind === 'playwright' || kind === 'todoist' || kind === 'http') {
    return false
  }

  return kind !== 'mcp' || fields.auth === 'oauth'
}

/** Где сервер был настроен - ключ подписи и имя проекта (последняя часть пути). */
export const importScope = (
  candidate: ImportCandidate,
): { key: ImportCandidate['scope']; project: string } => ({
  key: candidate.scope,
  project: candidate.projectPath ? folderName(candidate.projectPath) : '',
})

/** Имя сервера в IDE другое: правила и хуки на mcp__<имя>__* с ним не совпадут. */
export const isRenamed = (candidate: ImportCandidate): boolean =>
  !candidate.blocked && candidate.serverName !== candidate.name

/** Проекты для выбора коннекторов: открытые, потом недавние, без повторов. */
export const knownProjects = (workspace: WorkspaceState | undefined): ProjectRef[] => {
  const all = [...(workspace?.projects ?? []), ...(workspace?.recentProjects ?? [])]

  return all.filter(
    (project, index) => all.findIndex((other) => other.rootPath === project.rootPath) === index,
  )
}

/** Домены второго уровня у национальных зон: у co.uk сайт - три части имени, а не две. */
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'ac', 'edu'])

/** Сайт адреса для сравнения: последние две части имени (три у co.uk и подобных). */
const siteOf = (url: string): string | null => {
  try {
    const parts = new URL(url).hostname.split('.')
    const [zone = '', second = ''] = parts.slice(-2).reverse()
    const size = parts.length > 2 && zone.length === 2 && SECOND_LEVEL.has(second) ? 3 : 2

    return parts.slice(-size).join('.')
  } catch {
    return null
  }
}

/** Хост адреса, куда ходит коннектор: его человек должен узнать с одного взгляда. */
export const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * Адрес API не на сайте документации, которую дал человек: повод проверить, что это
 * официальный адрес сервиса, а не тот, что подсунула чужая страница. Документации нет -
 * сравнивать не с чем.
 */
export const isForeignHost = (baseUrl: string, docsUrl: string): boolean => {
  const docs = docsUrl ? siteOf(docsUrl) : null
  const base = siteOf(baseUrl)

  return Boolean(docs && base && docs !== base)
}

/**
 * Папки из списков «только в отмеченных», которых нет среди открытых и недавних проектов:
 * переименованные, перенесённые, давно не открытые. Их видно в выборе по проектам, иначе
 * подпись «только в N» считала бы проекты, которых человек не видит.
 */
export const forgottenProjects = (
  connectors: readonly Pick<Connector, 'availability'>[],
  known: readonly Pick<ProjectRef, 'rootPath'>[],
): string[] => {
  const knownPaths = new Set(known.map((project) => project.rootPath))

  return [...new Set(connectors.flatMap((connector) => projectsIn(connector.availability)))].filter(
    (path) => !knownPaths.has(path),
  )
}

/**
 * Имя коннектора и вторая строка к нему: сначала имя (Gmail, Playwright), под ним подпись
 * подключения (Main, 1), совпадающая с именем не повторяется. Имя встроенного - имя типа на
 * языке окна (kindName), своего - имя его типа (ADR 0034).
 */
export const connectorNames = (
  connector: Pick<Connector, 'name' | 'label'>,
  kindName: string,
): { title: string; second: string } => {
  const title = connector.name ?? kindName

  return {
    title,
    second: connector.label.toLowerCase() === title.toLowerCase() ? '' : connector.label,
  }
}

/** Сколько подключений у своего типа. */
export const connectionsOf = (state: Pick<ConnectorsState, 'connectors'>, typeId: string): number =>
  state.connectors.filter((connector) => connector.typeId === typeId).length

/** Имя одной строкой - для вопроса «удалить?»: Playwright · 1, Gmail · Main, Chatkepr. */
export const connectorTitle = (
  connector: Pick<Connector, 'name' | 'label'>,
  kindName: string,
): string => {
  const { title, second } = connectorNames(connector, kindName)

  return [title, second].filter(Boolean).join(' · ')
}

/**
 * Чей коннектор или куда он ходит - для второй строки плитки после подписи: почта или
 * рабочее пространство, хост адреса, команда. Сервис сюда не идёт - он в заголовке.
 */
export const connectorDetail = (
  connector: Pick<Connector, 'account' | 'url' | 'command'>,
): string =>
  connector.account ?? (connector.url ? hostOf(connector.url) : null) ?? connector.command ?? ''

/** Сбой клиента Google: его чинят в карточке клиента Google, а не входом коннектора. */
export const isGoogleAppFailure = (failure: ConnectorFailure | null): boolean =>
  failure === 'google-app-missing' || failure === 'google-app-rejected'

/** Что у коннектора есть из сведений - по порядку для листа. */
export const connectorFacts = (
  connector: Connector,
): { key: 'account' | 'service' | 'address' | 'command'; value: string }[] =>
  (
    [
      { key: 'account', value: connector.account },
      { key: 'service', value: connector.service },
      { key: 'address', value: connector.url },
      { key: 'command', value: connector.command },
    ] as const
  ).flatMap(({ key, value }) => (value ? [{ key, value }] : []))

/** Выбор переноса по умолчанию: всё, что можно взять, кроме серверов .mcp.json. */
export const defaultImportChoice = (candidates: readonly ImportCandidate[]): Set<string> =>
  new Set(
    candidates.filter((item) => !item.blocked && item.scope !== 'project').map((item) => item.key),
  )

/** Метка работы ИИ на плитке: идёт, ждёт проверки, не вышла; остановленная - без метки. */
export const generationBadge = (generation: AiGeneration): GenerationBadge | null => {
  if (generation.status === 'idle') return null

  if (generation.status === 'failed') return generation.error === 'cancelled' ? null : 'failed'

  return generation.status
}
