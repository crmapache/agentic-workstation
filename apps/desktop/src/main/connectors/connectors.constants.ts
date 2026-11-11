import type { ConnectorKind } from '@shared/connectors'
import { CONNECTOR_REDIRECT_URL } from '@shared/connectors'

/**
 * Порт и путь возврата из браузера после входа - из общего адреса (shared/connectors.ts):
 * один на все входы, Notion сверяет его строго, у Slack app он вписан руками.
 */
const REDIRECT = new URL(CONNECTOR_REDIRECT_URL)

export const OAUTH_CALLBACK_PORT = Number(REDIRECT.port)

export const OAUTH_CALLBACK_PATH = REDIRECT.pathname

/** localhost, а не 127.0.0.1: Slack пускает http только на localhost. */
export const OAUTH_REDIRECT_URL = CONNECTOR_REDIRECT_URL

/** Сколько ждать возврата из браузера: человек мог отвлечься, но не на час. */
export const SIGN_IN_TIMEOUT_MS = 5 * 60_000

/**
 * Начало имени сервера по типу: у готовых сервисов имя всегда несёт сервис (ADR 0028, хук
 * отправки). У своего MCP, команды и коннектора от ИИ начала здесь нет: имя сервера даёт
 * его свой тип (ADR 0034, typeServerName), а импорт из конфига Claude Code сохраняет
 * прежние имена (chatkepr, shotter) - на них опираются правила и хуки.
 */
export const SERVER_PREFIX: Record<ConnectorKind, string> = {
  gmail: 'gmail',
  calendar: 'calendar',
  notion: 'notion',
  slack: 'slack',
  atlassian: 'atlassian',
  todoist: 'todoist',
  playwright: 'playwright',
  mcp: '',
  command: '',
  http: '',
}

/** Длина подписи в имени сервера: имя инструмента у провайдера ограничено (64 у Claude). */
export const LABEL_SLUG_MAX = 24

/**
 * Адреса официальных MCP-серверов. Todoist пускает по личному токену API в заголовке
 * Authorization (проверено 2026-11-10), Atlassian - только по OAuth (ADR 0036).
 */
export const REMOTE_MCP_URL = {
  notion: 'https://mcp.notion.com/mcp',
  slack: 'https://mcp.slack.com/mcp',
  atlassian: 'https://mcp.atlassian.com/v1/mcp',
  todoist: 'https://ai.todoist.net/mcp',
} as const

/** Встроенный коннектор, который работает официальным MCP-сервером по адресу. */
export const isRemoteKind = (kind: ConnectorKind): kind is keyof typeof REMOTE_MCP_URL =>
  kind in REMOTE_MCP_URL

/** Файлы в userData. */
export const CONNECTORS_FILE = 'connectors.json'
export const VAULT_FILE = 'connectors-vault.bin'
/** Папка файлов `--mcp-config` по проектам. */
export const MCP_CONFIG_DIR = 'connectors-mcp'

/** Как IDE представляется сервисам при регистрации клиента и подключении. */
export const CLIENT_NAME = 'Agentic Workstation'
