import { it, expect, describe } from 'vitest'

import { requestLine, parseRpcLine, responseLine } from './rpc-lines'

describe('строки JSON-RPC app-server', () => {
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
})
