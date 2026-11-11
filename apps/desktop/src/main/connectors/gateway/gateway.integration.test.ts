import { request } from 'node:http'
import { connect } from 'node:net'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import { ConnectorGateway } from './gateway'
import type { GatewayServer } from './gateway'

const echo: GatewayServer = {
  instructions: () => 'Test mailbox',
  tools: () =>
    Promise.resolve([
      {
        name: 'echo',
        description: 'Echo text back',
        inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      },
    ]),
  call: (name, args) =>
    Promise.resolve({ content: [{ type: 'text', text: `${name}:${String(args['text'])}` }] }),
}

/** Сырой запрос мимо SDK: проверить отказы шлюза. */
const rawPost = (url: string, headers: Record<string, string>): Promise<number> =>
  new Promise((resolve, reject) => {
    const outgoing = request(url, { method: 'POST', headers }, (response) => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })

    outgoing.on('error', reject)
    outgoing.end('{}')
  })

/** Два процесса провайдера со своими ключами: почта видна только первому. */
const LAUNCHES: Record<string, string> = { 'key-a': 'a', 'key-b': 'b' }

describe('ConnectorGateway', () => {
  let gateway: ConnectorGateway<string>

  beforeEach(async () => {
    gateway = new ConnectorGateway<string>(
      {
        authorize: (token) => LAUNCHES[token] ?? null,
        resolve: (name, launch) => (name === 'gmail-work' && launch === 'a' ? echo : null),
      },
      '0.0.0',
    )
    await gateway.start()
  })

  afterEach(async () => {
    await gateway.stop()
  })

  it('клиент MCP с ключом видит инструменты, пояснение и вызывает их', async () => {
    const client = new Client({ name: 'test', version: '1' })
    const transport = new StreamableHTTPClientTransport(new URL(gateway.urlOf('gmail-work')!), {
      requestInit: { headers: { Authorization: 'Bearer key-a' } },
    })

    await client.connect(transport)

    const { tools } = await client.listTools()
    const result = await client.callTool({ name: 'echo', arguments: { text: 'hi' } })

    expect(client.getInstructions()).toBe('Test mailbox')
    expect(tools.map((tool) => tool.name)).toEqual(['echo'])
    expect(result.content).toEqual([{ type: 'text', text: 'echo:hi' }])
    await client.close()
  })

  it('без ключа, с чужим Host и к незнакомому серверу - отказ', async () => {
    const url = gateway.urlOf('gmail-work')!
    const auth = { Authorization: 'Bearer key-a', 'Content-Type': 'application/json' }

    expect(await rawPost(url, { 'Content-Type': 'application/json' })).toBe(401)
    expect(await rawPost(url, { ...auth, Authorization: 'Bearer key-x' })).toBe(401)
    expect(await rawPost(url, { ...auth, Host: 'evil.example:80' })).toBe(403)
    expect(await rawPost(gateway.urlOf('notion-x')!, auth)).toBe(404)
  })

  it('коннектор, не видный процессу, - нет такого сервера, даже с годным ключом', async () => {
    const url = gateway.urlOf('gmail-work')!

    expect(
      await rawPost(url, { Authorization: 'Bearer key-b', 'Content-Type': 'application/json' }),
    ).toBe(404)
  })

  it('кривая строка запроса без ключа - отказ, а не падение', async () => {
    const port = new URL(gateway.urlOf('gmail-work')!).port
    const answer = await new Promise<string>((resolve, reject) => {
      const socket = connect(Number(port), '127.0.0.1', () => {
        socket.write(`POST http://[ HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`)
      })
      let data = ''

      socket.on('data', (chunk) => {
        data += chunk.toString()
        socket.end()
      })
      socket.on('end', () => resolve(data))
      socket.on('error', reject)
    })

    expect(answer.split('\r\n')[0]).toMatch(/^HTTP\/1\.1 (400|401)/)
  })
})
