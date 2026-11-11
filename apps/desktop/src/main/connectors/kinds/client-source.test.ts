import { it, vi, expect, describe } from 'vitest'

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'

import { ClientSource } from './client-source'

type Call = (...args: unknown[]) => Promise<unknown>

/** Клиент, который отвечает списком из одного инструмента и вызовом по сценарию. */
const fakeClient = (callTool: Call = () => Promise.resolve({ content: [] })) =>
  ({
    listTools: () =>
      Promise.resolve({ tools: [{ name: 'echo', inputSchema: { type: 'object' } }] }),
    callTool,
    close: () => Promise.resolve(),
  }) as unknown as Client

/** Источник, у которого подключения идут по очереди из списка. */
class ScriptedSource extends ClientSource {
  opened = 0

  constructor(private readonly opens: (() => Promise<Client>)[]) {
    super()
  }

  protected override open(): Promise<Client> {
    const open = this.opens[this.opened] ?? this.opens.at(-1)

    this.opened += 1

    return open ? open() : Promise.reject(new Error('нет подключения'))
  }
}

const closed = () => Promise.reject(new McpError(ErrorCode.ConnectionClosed, 'Connection closed'))

describe('ClientSource', () => {
  it('команда упала на старте (ConnectionClosed) - следующий запрос поднимает заново', async () => {
    const source = new ScriptedSource([closed, closed, () => Promise.resolve(fakeClient())])

    await expect(source.listTools()).rejects.toThrow()
    expect((await source.listTools()).map((tool) => tool.name)).toEqual(['echo'])
    expect(source.opened).toBe(3)
  })

  it('сервер упал посреди вызова - соединение отвязано, следующий вызов на новом', async () => {
    const broken = fakeClient(() =>
      Promise.reject(new McpError(ErrorCode.ConnectionClosed, 'Connection closed')),
    )
    const source = new ScriptedSource([
      () => Promise.resolve(broken),
      () => Promise.resolve(fakeClient()),
    ])

    await expect(source.callTool('echo', {})).rejects.toBeInstanceOf(McpError)
    await expect(source.callTool('echo', {})).resolves.toEqual({ content: [] })
    expect(source.opened).toBe(2)
  })

  it('ответ сервера с ошибкой соединение не трогает', async () => {
    const client = fakeClient(() =>
      Promise.reject(new McpError(ErrorCode.InvalidParams, 'bad argument')),
    )
    const source = new ScriptedSource([() => Promise.resolve(client)])

    await expect(source.callTool('echo', {})).rejects.toThrow('bad argument')
    await expect(source.callTool('echo', {})).rejects.toThrow('bad argument')
    expect(source.opened).toBe(1)
  })

  it('вызов - с большим потолком, а не 60 секундами SDK', async () => {
    const callTool = vi.fn<Call>(() => Promise.resolve({ content: [] }))
    const source = new ScriptedSource([() => Promise.resolve(fakeClient(callTool))])

    await source.callTool('echo', {})

    const options = callTool.mock.calls[0]?.[2] as { timeout?: number } | undefined

    expect(options?.timeout).toBeGreaterThan(60 * 60_000)
  })

  it('после dispose вызов не поднимает процесс заново', async () => {
    const source = new ScriptedSource([() => Promise.resolve(fakeClient())])

    await source.dispose()

    await expect(source.callTool('echo', {})).rejects.toThrow()
    expect(source.opened).toBe(0)
  })
})
