import { BROWSER_SERVER_NAME } from '@shared/connectors'
import type { AddToTypeRequest, AddConnectorError, AddConnectorRequest } from '@shared/connectors'

import { parseEnvLine, splitCommandLine } from './command-line'
import type { ShellVariables } from './command-line'
import { commandForStore } from './connector-command'
import { labelSlug, serverNameFor } from './connector-names'
import { definitionSecrets } from './connector-secrets'
import type { ConnectorSecrets } from './connector-secrets'
import { blankConnector } from './connector-store'
import type { StoredType, StoredConnector } from './connector-store'
import { typeFrom, capitalized, definitionOf, typeServerName } from './connector-types'
import { publicUrl, hasSecretParts, isAllowedMcpUrl } from './connector-url'
import { playwrightCommand, isPlaywrightVersion } from './kinds/playwright'
import { parseSpec } from './kinds/http/http-spec'

/**
 * Новый коннектор и его первые секреты (Slack app, ключ своего MCP). type - новый свой тип
 * (ADR 0034), если коннектор - его первое подключение, с секретами образца.
 */
export type NewConnector = {
  connector: StoredConnector
  secrets: ConnectorSecrets
  type?: { stored: StoredType; secrets: ConnectorSecrets }
}

/** Что уже занято: имена серверов и начала имён своих типов. */
export type TakenNames = { servers: ReadonlySet<string>; bases: ReadonlySet<string> }

/**
 * Проверить просьбу окна и собрать коннектор. Имя сервера - из типа и подписи, и оно
 * должно быть свободно: два сервера с одним именем провайдер не различит. Свой MCP, команда
 * и коннектор от ИИ заводят ещё и свой тип (customType). Секреты обязательны там, где без
 * них вход не начать: Slack без своего app, свой MCP с ключом без ключа. Адрес своего MCP -
 * https (http только на своей машине), а его ключ в строке запроса или пути уходит в
 * секреты: реестр лежит на диске открытым текстом. env - окружение оболочки входа: команда
 * раскрывает ~ и $NAME, как в терминале.
 */
export const newConnector = (
  request: AddConnectorRequest,
  ids: { connector: string; type: string },
  taken: TakenNames,
  env: ShellVariables = {},
): NewConnector | AddConnectorError => {
  // Разбор по полю kind, а не isCustomKind: так TypeScript сужает и саму просьбу.
  if (request.kind === 'mcp' || request.kind === 'command' || request.kind === 'http') {
    return customType(request, ids, taken, env)
  }

  // Браузер для ИИ (ADR 0040) один на IDE: мост в Chrome у неё один, имя сервера постоянное.
  if (request.kind === 'browser') {
    if (taken.servers.has(BROWSER_SERVER_NAME)) return 'name-taken'

    return {
      connector: blankConnector({
        id: ids.connector,
        kind: 'browser',
        label: 'Chrome',
        serverName: BROWSER_SERVER_NAME,
      }),
      secrets: {},
    }
  }

  const label = capitalized(request.label)
  const serverName = serverNameFor(request.kind, label)

  if (!serverName) return 'bad-label'

  if (taken.servers.has(serverName)) return 'name-taken'

  const base = blankConnector({ id: ids.connector, kind: request.kind, label, serverName })

  if (request.kind === 'slack') {
    const clientId = request.clientId.trim()
    const clientSecret = request.clientSecret.trim()

    if (!clientId || !clientSecret) return 'missing-secret'

    return {
      connector: base,
      secrets: { client: { client_id: clientId, client_secret: clientSecret } },
    }
  }

  if (request.kind === 'playwright') return playwrightConnector(base, request, env)

  // Todoist - официальный MCP по личному токену: без него входа нет (ADR 0036).
  if (request.kind === 'todoist') {
    const token = request.token.trim()

    return token
      ? { connector: { ...base, auth: 'token', transport: 'http' }, secrets: { bearer: token } }
      : 'missing-secret'
  }

  return { connector: base, secrets: {} }
}

/**
 * Playwright (ADR 0035): команда npx @playwright/mcp из настроек подключения. Версия -
 * latest или номер; папка сохранённого профиля - путь от корня или от ~ (раскрывается из
 * окружения оболочки). Секретов нет.
 */
const playwrightConnector = (
  base: StoredConnector,
  request: Extract<AddConnectorRequest, { kind: 'playwright' }>,
  env: ShellVariables,
): NewConnector | AddConnectorError => {
  const version = request.version.trim() || 'latest'
  const typed = request.profileDir.trim()
  const home = env['HOME'] ?? ''
  const profileDir = typed.startsWith('~/') && home ? `${home}${typed.slice(1)}` : typed

  if (!isPlaywrightVersion(version)) return 'bad-version'

  if (request.profile === 'saved' && (!profileDir.startsWith('/') || /[\0\r\n]/.test(profileDir))) {
    return 'bad-profile'
  }

  const command = playwrightCommand({
    version,
    profileDir: request.profile === 'saved' ? profileDir : null,
    headless: request.headless,
  })

  return { connector: { ...base, command }, secrets: {} }
}

type CustomRequest = Extract<AddConnectorRequest, { kind: 'mcp' | 'command' | 'http' }>

/**
 * Новый свой тип и его первое подключение. Имя - с заглавной, из него начало имён серверов
 * (Playwright - playwright); «несколько раз» - имя сервера ещё и с подписью подключения
 * (playwright-1), «один раз» - одно начало (chatkepr). Секреты того, чем он работает, тип
 * держит как образец для следующих подключений.
 */
const customType = (
  request: CustomRequest,
  ids: { connector: string; type: string },
  taken: TakenNames,
  env: ShellVariables,
): NewConnector | AddConnectorError => {
  const name = capitalized(request.name)
  const serverBase = labelSlug(name)
  const label = request.multiple ? capitalized(request.label) : ''

  if (!serverBase) return 'bad-name'

  const serverName = typeServerName({ serverBase, multiple: request.multiple }, label)

  if (!serverName) return 'bad-label'

  if (taken.bases.has(serverBase) || taken.servers.has(serverName)) return 'name-taken'

  const base = {
    ...blankConnector({ id: ids.connector, kind: request.kind, label, serverName }),
    typeId: ids.type,
  }
  const built = customDefinition(request, base, env)

  if (typeof built === 'string') return built

  const stored = typeFrom(built.connector, {
    id: ids.type,
    name,
    multiple: request.multiple,
    serverBase,
  })

  return stored
    ? { ...built, type: { stored, secrets: definitionSecrets(built.secrets) } }
    : 'failed'
}

/** Чем работает свой MCP, команда или коннектор от ИИ - и вход первого подключения. */
const customDefinition = (
  request: CustomRequest,
  base: StoredConnector,
  env: ShellVariables,
): NewConnector | AddConnectorError => {
  if (request.kind === 'command') {
    return commandConnector(base, request.commandLine, request.envLine, env)
  }

  if (request.kind === 'mcp') {
    const url = request.url.trim()

    if (!isAllowedMcpUrl(url)) return 'bad-url'

    const connector = {
      ...base,
      url: publicUrl(url),
      auth: request.auth,
      transport: 'http' as const,
    }
    const signIn = connectionSecrets(connector, request)

    if (!signIn) return 'missing-secret'

    return { connector, secrets: { ...signIn, ...(hasSecretParts(url) ? { url } : {}) } }
  }

  const spec = parseSpec(request.spec)

  if (!spec) return 'bad-spec'

  const connector = { ...base, spec }
  const signIn = connectionSecrets(connector, request)

  return signIn ? { connector, secrets: signIn } : 'missing-secret'
}

/**
 * Вход одного подключения своего типа: ключ своего MCP с входом по ключу, ключ (или пароль
 * Basic) и логин коннектора от ИИ. Нужного нет - null. Вход в браузере и команда входа здесь
 * не просят.
 */
const connectionSecrets = (
  connector: Pick<StoredConnector, 'kind' | 'auth' | 'spec'>,
  fields: { token?: string; secret?: string; username?: string },
): ConnectorSecrets | null => {
  if (connector.kind === 'mcp' && connector.auth === 'token') {
    const token = fields.token?.trim() ?? ''

    return token ? { bearer: token } : null
  }

  const auth = connector.spec?.auth.type ?? 'none'

  if (connector.kind !== 'http' || auth === 'none') return {}

  const secret = fields.secret?.trim() ?? ''
  const username = fields.username?.trim() ?? ''

  if (!secret || (auth === 'basic' && !username)) return null

  return { apiKey: secret, ...(auth === 'basic' ? { basicUser: username } : {}) }
}

/**
 * Ещё одно подключение своего типа «несколько раз»: копия того, чем тип работает, и его
 * секретов-образца, своя подпись и свой вход. Имя сервера - начало типа и подпись.
 */
export const newConnection = (
  type: StoredType,
  typeSecrets: ConnectorSecrets,
  request: AddToTypeRequest,
  id: string,
  taken: ReadonlySet<string>,
): NewConnector | AddConnectorError => {
  const label = capitalized(request.label)
  const serverName = type.multiple ? typeServerName(type, label) : null

  if (!serverName) return 'bad-label'

  if (taken.has(serverName)) return 'name-taken'

  const connector = {
    ...blankConnector({ id, kind: type.kind, label, serverName }),
    ...definitionOf(type),
  }
  const signIn = connectionSecrets(connector, request)

  return signIn ? { connector, secrets: { ...typeSecrets, ...signIn } } : 'missing-secret'
}

/**
 * Команда MCP-сервера: строка разбирается по словам, как в оболочке, с её подстановками,
 * переменные окружения - парами KEY=value. Незакрытая кавычка, неизвестная переменная или
 * кривая пара - отказ: сервер без ключа молча не заработал бы. Без переводов строк и
 * нулевого байта: их в аргументах запуска не бывает. Ключи из аргументов - в секреты.
 */
const commandConnector = (
  base: StoredConnector,
  commandLine: string,
  envLine: string,
  shell: ShellVariables,
): NewConnector | AddConnectorError => {
  if (/[\0\r\n]/.test(commandLine + envLine)) return 'bad-command'

  const [command, ...args] = splitCommandLine(commandLine.trim(), shell) ?? []
  const [shownCommand = '', ...shownArgs] = splitCommandLine(commandLine.trim()) ?? []
  const env = parseEnvLine(envLine.trim(), shell)

  if (!command || !env) return 'bad-command'

  const { stored, secret } = commandForStore(
    { command, args },
    { command: shownCommand, args: shownArgs },
    null,
  )

  return {
    connector: { ...base, command: stored },
    secrets: {
      ...(Object.keys(env).length ? { env } : {}),
      ...(secret ? { command: secret } : {}),
    },
  }
}
