/**
 * Коннекторы к приложениям (ADR 0028): их держит IDE, а не провайдер. Каждый коннектор -
 * отдельный MCP-сервер на локальном шлюзе IDE со своим именем и своим входом, поэтому
 * двух почт или двух Notion может быть сколько угодно, и смена аккаунта Claude их не
 * касается.
 */

/**
 * Куда браузер возвращается после входа (порт записан в ~/.claude/ports.md). Его вписывают
 * в настройки своего Slack app, Notion сверяет его строго - менять нельзя.
 */
export const CONNECTOR_REDIRECT_URL = 'http://localhost:5319/callback'

import type { ConnectorAvailability } from './connector-availability'
import type { AiGeneration, HttpConnectorSpec } from './connector-spec'

/**
 * Тип коннектора. atlassian - Jira и Confluence в облаке Atlassian, todoist - Todoist по
 * личному токену, оба через официальные MCP (ADR 0036); playwright - браузер Playwright MCP
 * на этой машине (ADR 0035); mcp - любой
 * MCP-сервер по адресу (Linear, Sentry, свой); command - MCP-сервер командой на этой машине
 * (npx, node); http - описанный ИИ по документации сервиса (ADR 0029).
 */
export type ConnectorKind =
  | 'gmail'
  | 'calendar'
  | 'notion'
  | 'slack'
  | 'atlassian'
  | 'todoist'
  | 'playwright'
  | 'mcp'
  | 'command'
  | 'http'

export const CONNECTOR_KINDS: readonly ConnectorKind[] = [
  'gmail',
  'calendar',
  'notion',
  'slack',
  'atlassian',
  'todoist',
  'playwright',
  'mcp',
  'command',
  'http',
]

/**
 * Работает командой на этой машине: своя MCP-команда и Playwright. Своя копия на каждый
 * процесс разговора, входа нет (ADR 0029).
 */
export const runsCommand = (kind: ConnectorKind): boolean =>
  kind === 'command' || kind === 'playwright'

/**
 * Профиль браузера Playwright: чистый на каждый запуск (isolated) или сохранённый в папке -
 * входы на сайтах живут между разговорами.
 */
export type PlaywrightProfile = 'isolated' | 'saved'

export const PLAYWRIGHT_PROFILES: readonly PlaywrightProfile[] = ['isolated', 'saved']

/**
 * Свои типы: MCP-сервер по адресу, командой и описанный ИИ. У каждого такого коннектора есть
 * свой тип (CustomType) - имя с заглавной и то, чем он работает; остальные типы встроены.
 */
export type CustomKind = Extract<ConnectorKind, 'mcp' | 'command' | 'http'>

export const CUSTOM_KINDS: readonly CustomKind[] = ['mcp', 'command', 'http']

export const isCustomKind = (kind: ConnectorKind): kind is CustomKind =>
  kind === 'mcp' || kind === 'command' || kind === 'http'

/** Протокол своего MCP по адресу: Streamable HTTP или прежний SSE. */
export type McpTransport = 'http' | 'sse'

export const MCP_TRANSPORTS: readonly McpTransport[] = ['http', 'sse']

/** Как свой MCP-сервер пускает к себе: вход в браузере, ключ в заголовке или без входа. */
export type McpAuth = 'oauth' | 'token' | 'none'

export const MCP_AUTHS: readonly McpAuth[] = ['oauth', 'token', 'none']

/**
 * Ступень доступа инструмента. outbound - то, что увидят другие люди (письмо, сообщение,
 * ответ на приглашение, комментарий): по умолчанию выключено, включает только человек.
 */
export type ToolAccess = 'read' | 'write' | 'outbound'

export type ConnectorTool = {
  name: string
  description: string
  access: ToolAccess
  enabled: boolean
}

/**
 * connected - вход есть, инструменты отданы; signed-out - входа нет или он истёк;
 * signing-in - открыт браузер, ждём возврата; failed - сервис не ответил (причина в
 * failure); disabled - человек выключил коннектор.
 */
export type ConnectorStatus = 'connected' | 'signed-out' | 'signing-in' | 'failed' | 'disabled'

/** Почему не вышло, кодом: текст - в i18n окна. */
export type ConnectorFailure =
  | 'sign-in-failed'
  | 'sign-in-timeout'
  | 'sign-in-denied'
  | 'callback-busy'
  | 'unreachable'
  | 'vault-unavailable'
  | 'google-app-missing'
  | 'google-app-rejected'
  | 'google-api-disabled'
  | 'google-scope-missing'

/**
 * Потолок описания коннектора: пара абзацев о том, что это и зачем. Модель читает его при
 * каждом подключении к серверу, длинный текст стоил бы ей контекста в каждом разговоре.
 */
export const CONNECTOR_DESCRIPTION_MAX = 1000

export type Connector = {
  id: string
  kind: ConnectorKind
  /**
   * Свой тип (ADR 0034): чем работает и как называется. У встроенных (Gmail, Notion) - null,
   * их имя - имя типа на языке окна.
   */
  typeId: string | null
  /** Имя своего типа с заглавной: Playwright, Chatkepr. У встроенных - null. */
  name: string | null
  /**
   * Подпись подключения среди других того же типа: Work, Main, 1. У своего типа, который
   * подключают один раз, - пусто.
   */
  label: string
  /**
   * Что это за коннектор, словами человека - для него самого и для модели: она получает
   * описание вместе с сервером. Пусто - не задано.
   */
  description: string
  /** Имя сервера у провайдера: тип и подпись (gmail-work). Модель видит инструменты под ним. */
  serverName: string
  /** Чей вход: почта Google, рабочее пространство Slack или Notion. Не знаем - null. */
  account: string | null
  /** Адрес сервера - только у mcp (без строки запроса) и http (базовый адрес сервиса). */
  url: string | null
  /** Команда сервера - только у command, ключи в аргументах замаскированы. */
  command: string | null
  /** Сервис коннектора, описанного ИИ (Todoist); у остальных - null. */
  service: string | null
  /** Вход своего MCP; у остальных типов - null. */
  auth: McpAuth | null
  /** Входит по ключу, который можно заменить (свой MCP с ключом, коннектор от ИИ). */
  takesToken: boolean
  enabled: boolean
  /** Входит через браузер (OAuth); свой MCP с ключом или без входа - нет. */
  signsIn: boolean
  /** Вход есть - даже если коннектор выключен: кнопка «выйти» видна и тогда. */
  signedIn: boolean
  status: ConnectorStatus
  failure: ConnectorFailure | null
  /** Инструменты, как их отдал сервис в последний раз, с выключенными. */
  tools: ConnectorTool[]
  /** В каких проектах коннектор виден провайдеру. */
  availability: ConnectorAvailability
}

/** Чем подключение своего типа входит - какие поля нужны форме нового подключения. */
export type TypeSignIn = 'browser' | 'token' | 'key' | 'basic' | 'none'

/**
 * Свой тип коннектора (ADR 0034): имя с заглавной и то, чем он работает. Подключать
 * несколько раз (multiple) - тип стоит в каталоге рядом с Gmail, помечен своим и удаляется
 * оттуда вместе с подключениями. Один раз - живёт, пока живёт его подключение.
 */
export type CustomType = {
  id: string
  kind: CustomKind
  name: string
  multiple: boolean
  /** Чем работает - для плитки каталога: команда (ключи замаскированы), хост адреса, сервис. */
  detail: string
  signIn: TypeSignIn
}

/** Свой клиент OAuth Google владельца: один на все Gmail и Calendar. */
export type GoogleAppState = {
  configured: boolean
  /** Конец идентификатора клиента - узнать свой. Сам он не секрет, секрет - его ключ. */
  clientHint: string | null
}

export type ConnectorsState = {
  connectors: Connector[]
  /** Свои типы коннекторов - и те, что подключают один раз. */
  types: CustomType[]
  google: GoogleAppState
  /** Шифрование хранилища секретов доступно. Нет - вход не сохранить. */
  vault: boolean
  /** Прежнее хранилище не расшифровалось и отложено рядом: входы надо сделать заново. */
  vaultReset: boolean
  /** Коннектор, который сейчас описывает ИИ (ADR 0029). */
  generation: AiGeneration
}

/**
 * Новый свой тип и его первое подключение: имя типа (с заглавной его делает главный
 * процесс), можно ли подключать несколько раз и подпись подключения - нужна, только если
 * можно.
 */
export type NewTypeFields = { name: string; multiple: boolean; label: string }

export type AddConnectorRequest =
  | { kind: 'gmail' | 'calendar' | 'notion' | 'atlassian'; label: string }
  /** Личный токен API Todoist: с ним официальный MCP Todoist пускает без входа в браузере. */
  | { kind: 'todoist'; label: string; token: string }
  | { kind: 'slack'; label: string; clientId: string; clientSecret: string }
  /**
   * Playwright: профиль, папка сохранённого (~ раскрывает главный процесс), скрытый браузер и
   * версия пакета (пусто - latest).
   */
  | {
      kind: 'playwright'
      label: string
      profile: PlaywrightProfile
      profileDir: string
      headless: boolean
      version: string
    }
  | ({ kind: 'mcp'; url: string; auth: McpAuth; token: string } & NewTypeFields)
  /** Строка команды и переменные окружения KEY=value - разбирает главный процесс. */
  | ({ kind: 'command'; commandLine: string; envLine: string } & NewTypeFields)
  /** Описание от ИИ, ключ (или пароль Basic) и логин Basic. */
  | ({ kind: 'http'; spec: HttpConnectorSpec; secret: string; username: string } & NewTypeFields)

/**
 * Ещё одно подключение своего типа: подпись и вход этого подключения - ключ своего MCP,
 * ключ (или пароль Basic) и логин коннектора от ИИ. Чем работает, берётся у типа.
 */
export type AddToTypeRequest = {
  typeId: string
  label: string
  token: string
  secret: string
  username: string
}

/** Что меняется у своего типа: имя (имена серверов остаются) и «несколько раз». */
export type UpdateTypeRequest = { typeId: string; name?: string; multiple?: boolean }

/** Почему коннектор не добавлен. */
export type AddConnectorError =
  | 'bad-name'
  | 'bad-label'
  | 'name-taken'
  | 'bad-url'
  | 'bad-command'
  | 'bad-profile'
  | 'bad-version'
  | 'bad-spec'
  | 'missing-secret'
  | 'vault-unavailable'
  | 'google-app-missing'
  | 'failed'

export type AddConnectorOutcome = {
  state: ConnectorsState
  error: AddConnectorError | null
  /** id нового коннектора: окно сразу открывает его карточку. */
  id: string | null
}

/** Почему клиент Google не принят. cancelled - человек закрыл выбор файла. */
export type GoogleAppError = 'bad-file' | 'not-desktop-client' | 'vault-unavailable' | 'cancelled'

export type GoogleAppOutcome = {
  state: ConnectorsState
  error: GoogleAppError | null
}

/**
 * Приложение ИИ на этом Mac, которое умеет работать в браузере человека: ему IDE отдаёт
 * настройку, которую в самой IDE не сделать (клиент Google в Cloud Console).
 */
export type AgentApp = 'claude' | 'codex'

export const AGENT_APPS: readonly AgentApp[] = ['claude', 'codex']

/**
 * Почему сервер не взять: имя уже занято коннектором, повтор имени в самом списке, имя
 * без латиницы и цифр (из него не выйдет имя сервера).
 */
export type ImportBlock = 'taken' | 'duplicate' | 'bad-name'

/** MCP-сервер из конфига Claude Code, который можно взять коннектором. */
export type ImportCandidate = {
  /** Ключ кандидата: область, проект и имя - по нему просят импорт. */
  key: string
  name: string
  /**
   * Имя сервера в IDE. Отличается от name - правила и хуки на mcp__<name>__* с ним не
   * совпадут, это видно в списке. У bad-name - пусто.
   */
  serverName: string
  kind: 'mcp' | 'command'
  /** Команда или адрес - ключи замаскированы. */
  target: string
  /** user - для всех проектов, local и project - для одного (projectPath). */
  scope: 'user' | 'local' | 'project'
  projectPath: string | null
  /** Вход у сервера был через OAuth Claude Code: в IDE войти заново. */
  needsSignIn: boolean
  blocked: ImportBlock | null
  /**
   * Сервер из .mcp.json, который человек ещё не одобрил в Claude Code. Отклонённые не
   * предлагаются вовсе, а .mcp.json недоверенной папки не читается.
   */
  pending: boolean
}

/**
 * Почему выбранный сервер не перенёсся: имя заняли, в конфиге переменная, которой нет в
 * оболочке, сервер по адресу не ответил на пробе (вход не узнать), нет шифрования для
 * ключей, прочее.
 */
export type ImportSkipReason = 'taken' | 'variable' | 'unreachable' | 'vault-unavailable' | 'failed'

export type ImportOutcome = {
  state: ConnectorsState
  imported: number
  skipped: { name: string; reason: ImportSkipReason }[]
}
