import { it, expect, describe } from 'vitest'

import { requestLine, parseRpcLine, responseLine } from './rpc-lines'

describe('строки JSON-RPC', () => {
  it('ответ, уведомление и запрос сервера различаются по id и method', () => {
    expect(parseRpcLine('{"id":3,"result":{"ok":true}}')).toEqual({
      kind: 'response',
      id: 3,
      result: { ok: true },
      error: null,
    })
    expect(parseRpcLine('{"method":"turn/started","params":{"turnId":"t1"}}')).toEqual({
      kind: 'notification',
      method: 'turn/started',
      params: { turnId: 't1' },
    })
    expect(parseRpcLine('{"id":7,"method":"item/fileChange/requestApproval","params":{}}')).toEqual(
      {
        kind: 'request',
        id: 7,
        method: 'item/fileChange/requestApproval',
        params: {},
      },
    )
  })

  it('ошибка ответа - код и текст; мусор и чужой JSON - null', () => {
    expect(parseRpcLine('{"id":1,"error":{"code":-32601,"message":"nope"}}')).toMatchObject({
      error: { code: -32601, message: 'nope' },
    })
    expect(parseRpcLine('WARN something')).toBeNull()
    expect(parseRpcLine('{"hello":1}')).toBeNull()
    expect(parseRpcLine('[1,2]')).toBeNull()
  })

  it('наши строки - без поля jsonrpc и с переводом строки', () => {
    expect(requestLine(1, 'model/list', { includeHidden: false })).toBe(
      '{"id":1,"method":"model/list","params":{"includeHidden":false}}\n',
    )
    expect(requestLine(2, 'account/rateLimits/read', undefined)).toBe(
      '{"id":2,"method":"account/rateLimits/read"}\n',
    )
    expect(responseLine('s1', { result: { decision: 'accept' } })).toBe(
      '{"id":"s1","result":{"decision":"accept"}}\n',
    )
  })

  it('у JSON-RPC 2.0 (ACP) поле версии в каждой строке', () => {
    expect(requestLine(1, 'session/new', { cwd: '/p' }, 'jsonrpc2')).toBe(
      '{"jsonrpc":"2.0","id":1,"method":"session/new","params":{"cwd":"/p"}}\n',
    )
    expect(responseLine(4, { result: {} }, 'jsonrpc2')).toBe(
      '{"jsonrpc":"2.0","id":4,"result":{}}\n',
    )
    expect(parseRpcLine('{"jsonrpc":"2.0","method":"session/update","params":{}}')).toEqual({
      kind: 'notification',
      method: 'session/update',
      params: {},
    })
  })
})
