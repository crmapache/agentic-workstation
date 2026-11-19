import { rm, mkdtemp, readFile } from 'node:fs/promises'
import { request, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import type { GatewayServer } from '../gateway/gateway'
import type { Launch } from '../gateway/launches'
import { JsonFile } from '../../storage/json-file'
import { Vault } from '../../storage/vault'
import type { VaultCipher } from '../../storage/vault'
import { OutsideAccess } from './outside-access'
import type { StoredOutside } from './outside-access'

/** Подставной шифр: переворачивает байты - на диске не должно быть открытого текста. */
const reversing = (available = true): VaultCipher => ({
  available: () => available,
  encrypt: (text) => Buffer.from(text, 'utf8').reverse(),
  decrypt: (data) => Buffer.from(data).reverse().toString('utf8'),
})

/** Свободный порт: занять у системы и сразу отпустить. */
const freePort = async (): Promise<number> => {
  const server = createServer()

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  const { port } = server.address() as AddressInfo

  await new Promise((resolve) => server.close(resolve))

  return port
}

/** Сырой запрос мимо SDK: проверить отказы входа. */
const rawPost = (url: string, headers: Record<string, string>): Promise<number> =>
  new Promise((resolve, reject) => {
    const outgoing = request(url, { method: 'POST', headers }, (response) => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })

    outgoing.on('error', reject)
    outgoing.end('{}')
  })

/** Ключ из текста настройки для JSON-клиента. */
const keyOf = (setup: string | null): string => {
  const parsed = JSON.parse(setup ?? '{}') as {
    mcpServers: Record<string, { headers: { Authorization: string } }>
  }

  return (
    parsed.mcpServers['agentic-workstation']?.headers.Authorization.slice('Bearer '.length) ?? ''
  )
}

describe('OutsideAccess', () => {
  let dir = ''
  let port = 0
  let outside: OutsideAccess
  const launches: Launch[] = []

  const server: GatewayServer = {
    instructions: () => 'The IDE itself',
    tools: () =>
      Promise.resolve([
        { name: 'list_projects', description: 'Projects', inputSchema: { type: 'object' } },
      ]),
    call: () => Promise.resolve({ content: [{ type: 'text', text: 'ok' }] }),
  }

  const make = async (cipher = reversing()) =>
    new OutsideAccess({
      file: new JsonFile<StoredOutside>(join(dir, 'outside.json')),
      vault: await Vault.load(join(dir, 'vault.bin'), cipher),
      port,
      version: '0.0.0',
      server: (launch) => {
        launches.push(launch)

        return { name: 'workstation', server }
      },
      changed: () => undefined,
    })

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'outside-'))
    port = await freePort()
    outside = await make()
  })

  afterEach(async () => {
    await outside.stop()
    await rm(dir, { recursive: true, force: true })
  })

  it('выключен, пока не включат; включённый пускает клиента MCP с ключом', async () => {
    await outside.load()
    expect(outside.state()).toMatchObject({ enabled: false, status: 'off' })

    await outside.setEnabled(true)

    const state = outside.state()
    const key = keyOf(await outside.setupText('json'))
    const client = new Client({ name: 'test', version: '1' })

    await client.connect(
      new StreamableHTTPClientTransport(new URL(state.url), {
        requestInit: { headers: { Authorization: `Bearer ${key}` } },
      }),
    )

    expect(state).toMatchObject({ enabled: true, status: 'on' })
    expect(state.url).toBe(`http://127.0.0.1:${port}/mcp/workstation`)
    expect(client.getInstructions()).toBe('The IDE itself')
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(['list_projects'])
    // Снаружи нет ни проекта, ни разговора: проект инструменты берут из аргументов.
    expect(launches.at(-1)).toMatchObject({ projectPath: '', conversationId: null })
    await client.close()
  })

  it('без ключа, с чужим ключом, чужим Host и к другому серверу - отказ; localhost - свой', async () => {
    await outside.setEnabled(true)

    const { url } = outside.state()
    const key = keyOf(await outside.setupText('json'))
    const json = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    const auth = { ...json, Authorization: `Bearer ${key}` }

    expect(await rawPost(url, json)).toBe(401)
    expect(await rawPost(url, { ...json, Authorization: 'Bearer nope' })).toBe(401)
    expect(await rawPost(url, { ...auth, Host: `evil.example:${port}` })).toBe(403)
    expect(await rawPost(url.replace('workstation', 'gmail-work'), auth)).toBe(404)
    expect(await rawPost(url, { ...auth, Host: `localhost:${port}` })).not.toBe(403)
  })

  it('новый ключ отрезает старый; ключ на диске - только шифром', async () => {
    await outside.setEnabled(true)

    const { url } = outside.state()
    const old = keyOf(await outside.setupText('json'))

    await outside.renewKey()

    const fresh = keyOf(await outside.setupText('json'))
    const json = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }

    expect(fresh).not.toBe(old)
    expect(await rawPost(url, { ...json, Authorization: `Bearer ${old}` })).toBe(401)
    expect(await readFile(join(dir, 'vault.bin'), 'utf8')).not.toContain(fresh)
  })

  it('помнит включённый между запусками, выключенный гасит сервер', async () => {
    await outside.setEnabled(true)
    await outside.stop()

    const again = await make()

    await again.load()
    expect(again.state()).toMatchObject({ enabled: true, status: 'on' })

    await again.setEnabled(false)
    expect(again.state()).toMatchObject({ enabled: false, status: 'off' })
    await expect(rawPost(again.state().url, {})).rejects.toThrow()
  })

  it('порт занят - так и говорит, а не молчит', async () => {
    const holder = createServer()

    await new Promise<void>((resolve) => holder.listen(port, '127.0.0.1', resolve))
    await outside.setEnabled(true)
    expect(outside.state()).toMatchObject({ enabled: true, status: 'port-busy' })
    await new Promise((resolve) => holder.close(resolve))
  })

  it('без шифрования не включается и ключа не отдаёт', async () => {
    const plain = await make(reversing(false))

    await plain.setEnabled(true)
    expect(plain.state()).toMatchObject({ enabled: false, vault: false })
    expect(await plain.setupText('claude')).toBeNull()
  })

  it('настройка для Claude Code и Codex - с адресом и ключом заголовком', async () => {
    const url = outside.state().url
    const key = keyOf(await outside.setupText('json'))

    expect(await outside.setupText('claude')).toBe(
      `claude mcp add --transport http --scope user agentic-workstation ${url} --header "Authorization: Bearer ${key}"`,
    )
    expect(await outside.setupText('codex')).toBe(
      `[mcp_servers.agentic-workstation]\nurl = "${url}"\nhttp_headers = { "Authorization" = "Bearer ${key}" }`,
    )
  })
})
