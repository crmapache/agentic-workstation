import { rm, stat, mkdtemp, readFile } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import { EVERYWHERE } from '@shared/connector-availability'

import { JsonFile } from '../storage/json-file'
import type { LiveConnector } from './connector-live'
import { ConnectorRegistry } from './connector-registry'
import { blankConnector } from './connector-store'
import type { StoredConnectors } from './connector-store'
import { GatewayHost } from './gateway-host'
import type { GatewayServer } from './gateway/gateway'
import type { Launch } from './gateway/launches'

const connector = (id: string, availability = EVERYWHERE) => ({
  ...blankConnector({ id, kind: 'mcp', label: id, serverName: id }),
  url: 'https://x.dev/mcp',
  auth: 'none' as const,
  transport: 'http' as const,
  availability,
})

const server: GatewayServer = {
  instructions: () => '',
  tools: () => Promise.resolve([]),
  call: () => Promise.resolve({ content: [] }),
}

type ServerEntry = { url: string; headers: Record<string, string> }

const status = (entry: ServerEntry): Promise<number> =>
  new Promise((resolve, reject) => {
    const outgoing = request(
      entry.url,
      { method: 'POST', headers: { ...entry.headers, 'Content-Type': 'application/json' } },
      (response) => {
        response.resume()
        resolve(response.statusCode ?? 0)
      },
    )

    outgoing.on('error', reject)
    outgoing.end('{}')
  })

const serversIn = async (path: string): Promise<Record<string, ServerEntry>> =>
  (JSON.parse(await readFile(path, 'utf8')) as { mcpServers: Record<string, ServerEntry> })
    .mcpServers

describe('GatewayHost', () => {
  let dir = ''
  let host: GatewayHost
  let registry: ConnectorRegistry
  const released = vi.fn<(launchId: string) => void>()
  const asked: Launch[] = []

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gateway-host-'))
    registry = new ConnectorRegistry(
      {
        connectors: [
          connector('everywhere'),
          connector('only-a', { mode: 'only', projects: ['/p/a'] }),
          connector('not-b', { mode: 'only', projects: ['/p/a', '/p/c'] }),
        ],
        types: [],
        googleClientId: null,
      },
      new JsonFile<StoredConnectors>(join(dir, 'connectors.json')),
    )
    const live = {
      gatewayServer: (launch: Launch) => {
        asked.push(launch)

        return server
      },
    } as unknown as LiveConnector

    host = new GatewayHost(registry, () => live, join(dir, 'configs'), '0', released)
    await host.start()
  })

  afterEach(async () => {
    await host.stop()
    await rm(dir, { recursive: true, force: true })
    released.mockClear()
    asked.length = 0
  })

  it('у процесса свой файл - только видимые в его проекте коннекторы, права 600', async () => {
    const a = (await host.open('/p/a'))!
    const b = (await host.open('/p/b'))!

    expect(Object.keys(await serversIn(a.path))).toEqual(['everywhere', 'only-a', 'not-b'])
    expect(Object.keys(await serversIn(b.path))).toEqual(['everywhere'])
    expect((await stat(a.path)).mode & 0o777).toBe(0o600)
  })

  it('ключ у каждого процесса свой: по нему шлюз знает и проект, и сам процесс', async () => {
    const first = (await host.open('/p/a'))!
    const second = (await host.open('/p/a'))!
    const one = (await serversIn(first.path))['everywhere']!
    const two = (await serversIn(second.path))['everywhere']!

    expect(one.headers['Authorization']).not.toBe(two.headers['Authorization'])
    expect(await status(one)).not.toBe(404)
    expect(await status(two)).not.toBe(404)
    expect(new Set(asked.map((launch) => launch.id)).size).toBe(2)
  })

  it('ключ процесса проекта b не открывает коннектор, выключенный в b', async () => {
    const b = (await host.open('/p/b'))!
    const everywhere = (await serversIn(b.path))['everywhere']!

    expect(
      await status({ ...everywhere, url: everywhere.url.replace('everywhere', 'not-b') }),
    ).toBe(404)
  })

  it('выключенный в проекте коннектор шлюз не отдаёт и уже поднятому процессу', async () => {
    const servers = await serversIn((await host.open('/p/a'))!.path)

    expect(await status(servers['not-b']!)).not.toBe(404)
    await registry.update('everywhere', { availability: { mode: 'only', projects: ['/p/b'] } })
    expect(await status(servers['everywhere']!)).toBe(404)
  })

  it('процесс кончился - ключ больше не принимается, файл стёрт, процессы команд отпущены', async () => {
    const launch = (await host.open('/p/a'))!
    const servers = await serversIn(launch.path)

    launch.release()

    expect(await status(servers['everywhere']!)).toBe(401)
    expect(released).toHaveBeenCalledOnce()
    await vi.waitFor(async () => expect(await stat(launch.path).catch(() => null)).toBeNull())
  })
})
