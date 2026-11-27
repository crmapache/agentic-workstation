import { it, expect, describe } from 'vitest'

import { mcpAskOf, pickMcpCall, mcpApprovalAnswer } from './codex-mcp-approval'

/** Вопрос Codex 0.163 об одобрении вызова - как его шлёт `mcpServer/elicitation/request`. */
const approval = (meta: Record<string, unknown>, mode = 'form') => ({
  threadId: 't1',
  turnId: 'turn-1',
  serverName: 'browser-chrome',
  mode,
  message: 'Allow the browser-chrome MCP server to run tool "open"?',
  requestedSchema: { type: 'object', properties: {} },
  _meta: { codex_approval_kind: 'mcp_tool_call', ...meta },
})

describe('одобрение вызова MCP у Codex', () => {
  it('форма с пометкой Codex - вопрос о вызове: сервер, инструмент из текста, аргументы', () => {
    expect(
      mcpAskOf(approval({ persist: ['session', 'always'], tool_params: { url: 'https://a' } })),
    ).toEqual({
      server: 'browser-chrome',
      tool: 'open',
      params: { url: 'https://a' },
      session: true,
    })
    // Codex предложил только «навсегда» или ничего - «до конца сессии» нет.
    expect(mcpAskOf(approval({ persist: 'always' }))?.session).toBe(false)
    expect(mcpAskOf(approval({}))).toMatchObject({ params: {}, session: false })
    expect(mcpAskOf(approval({ persist: 'session' }, 'openai/form'))?.session).toBe(true)
  })

  it('не одобрение: ссылка, форма без пометки или с другой пометкой - null', () => {
    expect(mcpAskOf({ ...approval({}), mode: 'url', url: 'https://x' })).toBeNull()
    expect(mcpAskOf({ ...approval({}), _meta: null })).toBeNull()
    expect(mcpAskOf(approval({ codex_approval_kind: 'tool_suggestion' }))).toBeNull()
  })

  it('вызов ленты: тот же сервер и инструмент с теми же аргументами, иначе последний такой', () => {
    const ask = { server: 'chatkepr', tool: 'list_chats', params: { query: 'a', limit: 5 } }
    const candidates = [
      { id: 'c1', server: 'chatkepr', tool: 'list_chats', input: { limit: 5, query: 'a' } },
      { id: 'c2', server: 'chatkepr', tool: 'list_chats', input: { query: 'b' } },
      { id: 'c3', server: 'gmail', tool: 'list_chats', input: { query: 'a', limit: 5 } },
    ]

    // Параллельные вызовы одного сервера: аргументы решают, порядок ключей - нет.
    expect(pickMcpCall(candidates, { ...ask, session: true })).toBe('c1')
    expect(pickMcpCall(candidates, { ...ask, params: { query: 'z' }, session: true })).toBe('c2')
    // Инструмента в тексте вопроса нет - по серверу.
    expect(pickMcpCall(candidates, { ...ask, tool: '', params: {}, session: true })).toBe('c2')
    expect(pickMcpCall(candidates, { ...ask, server: 'slack', session: true })).toBeNull()
  })

  it('ответ: разрешить, разрешить до конца сессии (если Codex умеет), отказ', () => {
    expect(mcpApprovalAnswer(true, false, true)).toEqual({
      action: 'accept',
      content: {},
      _meta: null,
    })
    expect(mcpApprovalAnswer(true, true, true)).toEqual({
      action: 'accept',
      content: {},
      _meta: { persist: 'session' },
    })
    expect(mcpApprovalAnswer(true, true, false)).toMatchObject({ _meta: null })
    expect(mcpApprovalAnswer(false, false, true)).toEqual({
      action: 'decline',
      content: null,
      _meta: null,
    })
  })
})
