import type { ConnectorFailure } from '@shared/connectors'

/** Ответ сервиса о сбое для карточки: код причины, его собственные слова и куда идти чинить. */
export type ServiceAnswer = {
  failure: ConnectorFailure
  /** Что сервис сказал сам (его текст, без нашего перевода); не сказал - null. */
  detail: string | null
  /** Страница настроек, где это чинится, - только известные адреса; нет - null. */
  url: string | null
}

/** Слова сервиса на карточке - пара строк, а не простыня. */
const DETAIL_MAX = 300

/** Slack пускает к MCP только приложение с включённым Model Context Protocol. */
const SLACK_MCP_OFF = /not enabled for Slack MCP server access/i

/** Страница приложения Slack, где включается MCP: её Slack называет в ответе сам. */
const SLACK_APP_PAGE = /https:\/\/api\.slack\.com\/apps\/[A-Z0-9]+\/app-assistant/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Текст ошибки JSON-RPC, который транспорт MCP вклеивает в своё сообщение
 * («Error POSTing to endpoint: {"jsonrpc":"2.0","error":{"message":…}}»). Нет такого - null.
 */
const rpcMessage = (text: string): string | null => {
  const start = text.indexOf('{"jsonrpc"')

  if (start < 0) return null

  try {
    const body: unknown = JSON.parse(text.slice(start))
    const error = isRecord(body) ? body['error'] : null
    const message = isRecord(error) ? error['message'] : null

    return typeof message === 'string' && message.trim() ? message.trim() : null
  } catch {
    return null
  }
}

/**
 * Что ответил сервис, когда список инструментов не пришёл. Slack без включённого MCP -
 * своя причина и страница, где его включить: «сервис не ответил» отправил бы человека жать
 * «обновить» без толку. Другой ответ сервиса - его слова под «не ответил». Ответа сервиса нет
 * (сеть, таймаут) - null.
 */
export const serviceAnswer = (error: unknown): ServiceAnswer | null => {
  const message = rpcMessage(error instanceof Error ? error.message : String(error))

  if (!message) return null

  if (SLACK_MCP_OFF.test(message)) {
    return {
      failure: 'slack-mcp-off',
      detail: null,
      url: SLACK_APP_PAGE.exec(message)?.[0] ?? null,
    }
  }

  return { failure: 'unreachable', detail: message.slice(0, DETAIL_MAX), url: null }
}
