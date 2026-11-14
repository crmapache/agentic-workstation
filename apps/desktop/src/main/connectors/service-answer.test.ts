import { it, expect, describe } from 'vitest'

import { serviceAnswer } from './service-answer'

/** Как транспорт MCP передаёт ответ сервиса с ошибкой (записано с Slack 2026-11-12). */
const posted = (body: string) =>
  Object.assign(new Error(`Streamable HTTP error: Error POSTing to endpoint: ${body}`), {
    code: 400,
  })

describe('ответ сервиса о сбое', () => {
  it('Slack без включённого MCP - своя причина и страница приложения', () => {
    const error = posted(
      '{"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"App is not enabled for Slack MCP server access. Please enable it here: https:\\/\\/api.slack.com\\/apps\\/A0CGWGFR6BH\\/app-assistant"}}',
    )

    expect(serviceAnswer(error)).toEqual({
      failure: 'slack-mcp-off',
      detail: null,
      url: 'https://api.slack.com/apps/A0CGWGFR6BH/app-assistant',
    })
  })

  it('другой ответ сервиса - его слова под «не ответил»; чужой адрес ссылкой не становится', () => {
    const error = posted(
      '{"jsonrpc":"2.0","id":null,"error":{"code":-32001,"message":"Workspace admins turned off MCP. See https://evil.example"}}',
    )

    expect(serviceAnswer(error)).toEqual({
      failure: 'unreachable',
      detail: 'Workspace admins turned off MCP. See https://evil.example',
      url: null,
    })
  })

  it('сеть или таймаут - ответа сервиса нет', () => {
    expect(serviceAnswer(new Error('fetch failed'))).toBeNull()
    expect(serviceAnswer(posted('{"jsonrpc": broken'))).toBeNull()
    expect(serviceAnswer('nope')).toBeNull()
  })
})
