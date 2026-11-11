import { openExternalWeb } from '../window/open-external'
import {
  slackAppLink,
  slackScopesFrom,
  SLACK_USER_SCOPES_FALLBACK,
  SLACK_PROTECTED_RESOURCE_URL,
} from './slack-manifest'

/** Сколько ждать список разрешений у Slack: дольше - создаём с запасным. */
const SCOPES_TIMEOUT_MS = 5000

/** Разрешения, которые сейчас объявляет Slack MCP; не ответил - запасной список. */
const currentSlackScopes = async (): Promise<readonly string[]> => {
  try {
    const response = await fetch(SLACK_PROTECTED_RESOURCE_URL, {
      signal: AbortSignal.timeout(SCOPES_TIMEOUT_MS),
    })

    return response.ok ? slackScopesFrom(await response.json()) : SLACK_USER_SCOPES_FALLBACK
  } catch {
    return SLACK_USER_SCOPES_FALLBACK
  }
}

/**
 * Открыть в браузере создание Slack app с готовым описанием (ADR 0032): человек выбирает
 * рабочее пространство и жмёт Create. Разрешения берутся у Slack в момент нажатия - вход
 * попросит те же. Браузер не открылся - false.
 */
export const openSlackAppCreation = async (): Promise<boolean> =>
  openExternalWeb(slackAppLink(await currentSlackScopes()))
