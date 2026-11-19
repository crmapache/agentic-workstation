import { rm, mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { AcpProcess } from '../client/acp-process'
import { ACP_CLIENT_CAPABILITIES } from '../client/acp.constants'
import { kimiAgent } from '../../kimi/kimi-agent'
import {
  callsOf,
  fakeCalls,
  installFakeAgent,
} from '../../providers/acp/__fixtures__/fake-acp-agent'
import { AcpCatalog } from './acp-catalog'

let dir = ''
let catalog: AcpCatalog
const project = '/work/project'

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'acp-catalog-'))
  await mkdir(join(dir, 'scratch'))

  const binary = await installFakeAgent(dir)

  catalog = new AcpCatalog({
    agent: kimiAgent(join(dir, 'kimi-root')),
    cli: () =>
      Promise.resolve({ binary, version: '2.7.0', env: process.env as Record<string, string> }),
    scratch: join(dir, 'scratch'),
    version: '0.0.0',
  })
})

afterEach(async () => {
  await catalog.dispose()
  await rm(dir, { recursive: true, force: true })
})

/** Разговоры у поддельного агента: новые сессии в папках по порядку. */
const sessionsIn = async (...places: string[]) => {
  const agent = new AcpProcess(
    {
      binary: join(dir, 'kimi'),
      args: ['acp'],
      cwd: dir,
      env: process.env as Record<string, string>,
      capabilities: ACP_CLIENT_CAPABILITIES,
      version: '0',
    },
    {
      onNotification: () => undefined,
      onRequest: () => Promise.resolve({}),
      onExit: () => undefined,
    },
  )

  for (const cwd of places) await agent.request('session/new', { cwd, mcpServers: [] })
  await agent.stop()
}

describe('процесс-каталог ACP', () => {
  it('история: все страницы списка, только своя папка, новые сверху', async () => {
    await sessionsIn(project, '/other', project, project)

    const history = await catalog.history(project, new Set(['session_3']))

    expect(history.map((entry) => entry.sessionId)).toEqual(['session_4', 'session_3', 'session_1'])
    expect(history[1]).toMatchObject({ title: 'Chat session_3', isOpen: true })
    expect(callsOf(await fakeCalls(dir), 'session/list')).toHaveLength(2)
  })

  it('повтор: лента из обновлений `session/load`, разговор сразу отпущен', async () => {
    await sessionsIn(project)

    const items = await catalog.replay('session_1', project)

    expect(items?.map((item) => item.kind)).toEqual(['user', 'assistant', 'turn'])
    expect(items?.[0]).toMatchObject({ text: 'hello session_1' })
    expect(callsOf(await fakeCalls(dir), 'session/close').at(-1)?.params).toEqual({
      sessionId: 'session_1',
    })
  })

  it('форк спящего разговора: новый id, форк отпущен для вкладки', async () => {
    await sessionsIn(project)

    expect(await catalog.fork('session_1', project)).toBe('session_1-fork')

    const calls = await fakeCalls(dir)

    expect(callsOf(calls, 'session/fork')[0]?.params).toMatchObject({ sessionId: 'session_1' })
    expect(callsOf(calls, 'session/close').at(-1)?.params).toEqual({ sessionId: 'session_1-fork' })
  })
})
