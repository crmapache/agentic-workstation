import { OAUTH_REDIRECT_URL } from './connectors.constants'

/** Где Slack MCP объявляет свои разрешения: их и просит вход (SDK берёт scopes_supported). */
export const SLACK_PROTECTED_RESOURCE_URL =
  'https://mcp.slack.com/.well-known/oauth-protected-resource'

/**
 * Разрешения Slack MCP на 2026-11-08 - на случай, если Slack не ответил. Вход просит всё, что
 * объявляет сервер, поэтому приложение должно знать каждое: иначе Slack откажет во входе.
 */
export const SLACK_USER_SCOPES_FALLBACK: readonly string[] = [
  'canvases:read',
  'canvases:write',
  'channels:history',
  'channels:read',
  'channels:write',
  'chat:write',
  'emoji:read',
  'files:read',
  'files:write',
  'groups:history',
  'groups:read',
  'groups:write',
  'im:history',
  'im:read',
  'im:write',
  'lists:read',
  'lists:write',
  'mpim:history',
  'mpim:read',
  'mpim:write',
  'reactions:read',
  'reactions:write',
  'search:read.files',
  'search:read.im',
  'search:read.mpim',
  'search:read.private',
  'search:read.public',
  'search:read.users',
  'users:read',
  'users:read.email',
]

const SCOPE_PATTERN = /^[a-z_]+:[a-z_.]+$/

/** Разрешения из ответа Slack: список строк вида `area:action`, иначе - запасной список. */
export const slackScopesFrom = (body: unknown): readonly string[] => {
  const scopes =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)['scopes_supported']
      : undefined

  if (!Array.isArray(scopes) || scopes.length === 0) return SLACK_USER_SCOPES_FALLBACK

  const valid = scopes.filter(
    (scope): scope is string => typeof scope === 'string' && SCOPE_PATTERN.test(scope),
  )

  return valid.length === scopes.length ? valid : SLACK_USER_SCOPES_FALLBACK
}

/**
 * Описание Slack app для IDE: адрес возврата, разрешения пользователя для MCP и бот, без
 * которого Slack не даёт установить приложение (сам бот не используется). Включить MCP
 * описанием нельзя - это один переключатель, который человек ставит сам.
 */
export const slackManifest = (userScopes: readonly string[]) => ({
  display_information: {
    name: 'Agentic Workstation',
    description:
      'Slack for the AI assistants in Agentic Workstation, through the official Slack MCP.',
    background_color: '#1d1d1f',
  },
  features: {
    bot_user: { display_name: 'Agentic Workstation', always_online: false },
  },
  oauth_config: {
    redirect_urls: [OAUTH_REDIRECT_URL],
    scopes: { user: [...userScopes], bot: ['users:read'] },
  },
  settings: {
    org_deploy_enabled: false,
    socket_mode_enabled: false,
    token_rotation_enabled: false,
  },
})

/** Ссылка, по которой Slack открывает создание приложения с готовым описанием. */
export const slackAppLink = (userScopes: readonly string[]): string =>
  `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(
    JSON.stringify(slackManifest(userScopes)),
  )}`
