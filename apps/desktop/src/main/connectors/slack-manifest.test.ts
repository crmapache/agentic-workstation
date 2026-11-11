import { it, expect, describe } from 'vitest'

import { CONNECTOR_REDIRECT_URL } from '@shared/connectors'

import type { slackManifest } from './slack-manifest'
import { slackAppLink, slackScopesFrom, SLACK_USER_SCOPES_FALLBACK } from './slack-manifest'

describe('slackScopesFrom', () => {
  it('берёт разрешения, которые объявил Slack', () => {
    expect(slackScopesFrom({ scopes_supported: ['chat:write', 'search:read.public'] })).toEqual([
      'chat:write',
      'search:read.public',
    ])
  })

  it('нет ответа, пустой список или мусор - запасной список', () => {
    expect(slackScopesFrom(null)).toBe(SLACK_USER_SCOPES_FALLBACK)
    expect(slackScopesFrom({ scopes_supported: [] })).toBe(SLACK_USER_SCOPES_FALLBACK)
    expect(slackScopesFrom({ scopes_supported: ['chat:write', 'x&y=z'] })).toBe(
      SLACK_USER_SCOPES_FALLBACK,
    )
  })
})

describe('slackAppLink', () => {
  it('открывает создание приложения с описанием: адрес возврата и разрешения внутри', () => {
    const url = new URL(slackAppLink(['chat:write']))
    const manifest = JSON.parse(url.searchParams.get('manifest_json') ?? '{}') as ReturnType<
      typeof slackManifest
    >

    expect(url.origin + url.pathname).toBe('https://api.slack.com/apps')
    expect(url.searchParams.get('new_app')).toBe('1')
    expect(manifest.oauth_config.redirect_urls).toEqual([CONNECTOR_REDIRECT_URL])
    expect(manifest.oauth_config.scopes.user).toEqual(['chat:write'])
    expect(manifest.features.bot_user.display_name).toBe('Agentic Workstation')
  })
})
