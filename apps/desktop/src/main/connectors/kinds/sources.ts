import type { ConnectorInProject } from '@shared/connectors'
import { runsCommand } from '@shared/connectors'

import { launchCommand } from '../connector-command'
import type { SecretsOf, ConnectorSecrets } from '../connector-secrets'
import type { ConnectorSource } from '../connector-source'
import type { StoredConnector } from '../connector-store'
import { isRemoteKind, REMOTE_MCP_URL } from '../connectors.constants'
import type { GoogleClient } from '../oauth/google-oauth'
import type { BrowserHub } from '../../browser/browser-hub'
import type { ProfileOpening } from '../../browser/chrome-profiles'
import type { ComputerRuntime } from '../../computer/computer-runtime'
import { NativeSource } from './native-tools'
import { RemoteMcpSource } from './remote-mcp'
import { StdioMcpSource } from './stdio-mcp'
import { createBrowserSource } from './browser/browser-tools'
import { createComputerSource } from './computer/computer-tools'
import { CALENDAR_TOOLS } from './google/calendar-tools'
import { GMAIL_TOOLS } from './google/gmail-tools'
import { GoogleSession, GoogleApiError } from './google/google-session'
import { HttpSpecSource } from './http/http-source'

export type SourceDeps = {
  googleClient: () => GoogleClient | null
  /** Окружение оболочки входа - для MCP-команд (PATH до npx, node, uvx). */
  shellEnv: () => Promise<Record<string, string>>
  version: string
  /** Связь с расширениями Chrome - для коннектора Browser (ADR 0040); в тестах - null. */
  browser: BrowserHub | null
  /** Мышь, клавиатура и экран мака - для коннектора Computer (ADR 0057); в тестах - null. */
  computer?: ComputerRuntime | null | undefined
  /** Открыть окно браузера в закрытом профиле по имени (ADR 0053); в тестах нет. */
  openBrowserProfile?: ((name: string) => Promise<ProfileOpening>) | undefined
  /** Что человек сказал про этот коннектор в проекте (ADR 0053); ставит живой коннектор. */
  inProject?: ((projectPath: string) => ConnectorInProject | null) | undefined
}

/**
 * Ошибки Google, текст которых модели полезен: неверный запрос, нет доступа. Беда с клиентом
 * Google уходит выше - её показывает карточка коннектора.
 */
const GOOGLE_EXPLAINABLE = [GoogleApiError]

/**
 * Адрес MCP-сервера коннектора; у своих инструментов (Google) его нет. У своего MCP с ключом
 * в адресе полный адрес лежит в секретах, в реестре - без ключа.
 */
export const remoteUrlOf = (
  connector: StoredConnector,
  secrets: ConnectorSecrets,
): string | null => {
  if (isRemoteKind(connector.kind)) return REMOTE_MCP_URL[connector.kind]

  return connector.kind === 'mcp' ? (secrets.url ?? connector.url) : null
}

/**
 * Источник инструментов коннектора по его типу. cwd - папка проекта процесса разговора:
 * команда без своей папки запускается в ней, как у Claude Code; null - в домашней.
 */
export const createSource = (
  connector: StoredConnector,
  secrets: SecretsOf,
  deps: SourceDeps,
  cwd: string | null = null,
): ConnectorSource => {
  if (connector.kind === 'gmail' || connector.kind === 'calendar') {
    const session = new GoogleSession(secrets, deps.googleClient)
    const tools = connector.kind === 'gmail' ? GMAIL_TOOLS : CALENDAR_TOOLS

    return new NativeSource(tools, session, GOOGLE_EXPLAINABLE)
  }

  // Браузер для ИИ: свои инструменты поверх расширения, сессии - по процессам разговоров.
  if (connector.kind === 'browser') {
    return deps.browser
      ? createBrowserSource(
          deps.browser,
          (path) => deps.inProject?.(path)?.browserProfile ?? null,
          deps.openBrowserProfile,
        )
      : new NativeSource([], null, [])
  }

  // Computer Use: один агент на машину, источник - инструменты поверх него.
  if (connector.kind === 'computer') {
    const { computer } = deps

    return computer
      ? createComputerSource(computer.agent, () => computer.idle())
      : new NativeSource([], null, [])
  }

  if (runsCommand(connector.kind) && connector.command) {
    return new StdioMcpSource({
      command: () => launchCommand(connector, secrets.read()),
      cwd,
      secrets,
      shellEnv: deps.shellEnv,
      version: deps.version,
    })
  }

  if (connector.kind === 'http' && connector.spec) {
    return new HttpSpecSource(connector.spec, () => {
      const { apiKey, basicUser = '' } = secrets.read()

      return connector.spec?.auth.type === 'none' || apiKey
        ? { secret: apiKey ?? '', username: basicUser }
        : null
    })
  }

  return new RemoteMcpSource({
    url: () => remoteUrlOf(connector, secrets.read()) ?? '',
    auth: connector.auth ?? 'oauth',
    transport: connector.transport ?? 'http',
    secrets,
    version: deps.version,
  })
}

/** Есть ли вход: токен Google, токен OAuth сервера, ключ - или вход не нужен вовсе. */
export const hasSignIn = (connector: StoredConnector, secrets: ConnectorSecrets): boolean => {
  if (connector.kind === 'gmail' || connector.kind === 'calendar') return Boolean(secrets.google)

  if (
    runsCommand(connector.kind) ||
    connector.kind === 'browser' ||
    connector.kind === 'computer'
  ) {
    return true
  }

  if (connector.kind === 'http')
    return connector.spec?.auth.type === 'none' || Boolean(secrets.apiKey)

  if (connector.auth === 'none') return true

  if (connector.auth === 'token') return Boolean(secrets.bearer)

  return Boolean(secrets.tokens)
}

/**
 * Входить в браузере надо готовым сервисам и своему MCP с OAuth; команде, Playwright, ИИ,
 * браузеру для ИИ и Computer Use - нет.
 */
export const signsInWithBrowser = (connector: StoredConnector): boolean => {
  if (
    runsCommand(connector.kind) ||
    connector.kind === 'http' ||
    connector.kind === 'browser' ||
    connector.kind === 'computer'
  ) {
    return false
  }

  // Свой MCP и Todoist - по способу входа, остальные встроенные входят в браузере.
  return connector.auth === null || connector.auth === 'oauth'
}
