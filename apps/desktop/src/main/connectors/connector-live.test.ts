import { it, vi, expect, describe, beforeEach } from 'vitest'

import { LiveConnector } from './connector-live'
import type { SecretsOf } from './connector-secrets'
import type { ConnectorSource } from './connector-source'
import { blankConnector } from './connector-store'
import type { StoredConnector } from './connector-store'
import { createSource } from './kinds/sources'
import type * as Sources from './kinds/sources'

vi.mock('./kinds/sources', async (importOriginal) => ({
  ...(await importOriginal<typeof Sources>()),
  createSource: vi.fn(),
}))

type FakeSource = ConnectorSource & { cwd: string | null }

const made: FakeSource[] = []

const command = (enabled = true): StoredConnector => ({
  ...blankConnector({ id: 'c', kind: 'command', label: 'pw', serverName: 'playwright-1' }),
  command: { command: 'npx', args: ['@playwright/mcp'], cwd: null },
  enabled,
  tools: [{ name: 'browser_navigate', description: '', access: 'read' }],
})

const liveOf = (connector: StoredConnector) =>
  new LiveConnector(
    connector,
    { read: () => ({}) } as unknown as SecretsOf,
    { googleClient: () => null, shellEnv: () => Promise.resolve({}), version: '0' },
    {
      stored: () => connector,
      typeName: () => null,
      signingIn: () => false,
      toolsListed: () => undefined,
      changed: () => undefined,
    },
  )

const signal = new AbortController().signal

beforeEach(() => {
  made.length = 0
  vi.mocked(createSource).mockImplementation((_connector, _secrets, _deps, cwd = null) => {
    const source: FakeSource = {
      cwd,
      listTools: vi.fn(() => Promise.resolve([])),
      callTool: vi.fn(() => Promise.resolve({ content: [] })),
      dispose: vi.fn(() => Promise.resolve()),
    }

    made.push(source)

    return source
  })
})

describe('LiveConnector', () => {
  it('команда: у каждого процесса разговора свой, в папке его проекта', async () => {
    const live = liveOf(command())
    const a = live.gatewayServer({ id: 'a', projectPath: '/p/a', released: false })
    const b = live.gatewayServer({ id: 'b', projectPath: '/p/b', released: false })

    await a.call('browser_navigate', {}, signal)
    await a.call('browser_navigate', {}, signal)
    await b.call('browser_navigate', {}, signal)

    const [, first, second] = made

    expect(made.map((source) => source.cwd)).toEqual([null, '/p/a', '/p/b'])
    expect(first?.callTool).toHaveBeenCalledTimes(2)
    expect(second?.callTool).toHaveBeenCalledOnce()

    live.release('a')

    expect(first?.dispose).toHaveBeenCalledOnce()
    expect(second?.dispose).not.toHaveBeenCalled()
  })

  it('выключенная команда не запускается даже для списка инструментов', async () => {
    await liveOf(command(false)).refresh()

    expect(made).toHaveLength(1)
    expect(made[0]?.listTools).not.toHaveBeenCalled()
  })

  it('список инструментов у команды - разовым процессом, он гасится', async () => {
    await liveOf(command()).refresh()

    const lister = made[1]

    expect(lister?.listTools).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(lister?.dispose).toHaveBeenCalledOnce())
  })

  it('после удаления вызов шлюза не поднимает новый процесс', async () => {
    const live = liveOf(command())

    await live.dispose()
    await live
      .gatewayServer({ id: 'a', projectPath: '/p/a', released: false })
      .call('browser_navigate', {}, signal)

    expect(made).toHaveLength(1)
  })

  it('вызов, пришедший после конца процесса разговора, не поднимает ему процесс команды', async () => {
    const live = liveOf(command())
    const result = await live
      .gatewayServer({ id: 'a', projectPath: '/p/a', released: true })
      .call('browser_navigate', {}, signal)

    expect(result.isError).toBe(true)
    expect(made).toHaveLength(1)
  })

  it('список для шлюза: разовый процесс в папке проекта, одновременные запросы - один процесс', async () => {
    const live = liveOf(command())
    const a = live.gatewayServer({ id: 'a', projectPath: '/p/a', released: false })
    const b = live.gatewayServer({ id: 'b', projectPath: '/p/b', released: false })

    await Promise.all([a.tools(), b.tools(), a.tools()])

    expect(made.slice(1).map((source) => source.cwd)).toEqual(['/p/a'])
  })
})
