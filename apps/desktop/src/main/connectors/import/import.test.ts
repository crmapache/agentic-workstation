import { it, expect, describe } from 'vitest'

import type { NewConnector } from '../connector-add'
import { blankConnector } from '../connector-store'
import { findServers } from './import-candidates'
import type { ProjectServers, McpJsonApprovals } from './import-candidates'
import { withImportType, importedConnector } from './import-connector'
import { expandConfigVariables } from './import-vars'

const userConfig = {
  mcpServers: {
    chatkepr: {
      type: 'stdio',
      command: 'node',
      args: ['/x/mcp/index.js', '--api-key', 'secret'],
      env: { WP_ARCHIVE_TOKEN: 't' },
    },
    snakein: {
      type: 'http',
      url: 'https://snakein.com/api/mcp',
      headers: { Authorization: 'Bearer snk_1', 'X-Team': 'a' },
    },
    keyed: { type: 'http', url: 'https://k.dev/mcp', headers: { 'X-API-Key': '${K_KEY}' } },
    notion: { type: 'http', url: 'https://mcp.notion.com/mcp' },
    weird: { type: 'websocket', url: 'wss://x' },
    my_server: { command: 'npx', args: ['my-server'] },
    почта: { command: 'npx', args: ['mail'] },
  },
}

const noApprovals: McpJsonApprovals = { enabled: new Set(), disabled: new Set(), all: false }

const app = (overrides: Partial<ProjectServers> = {}): ProjectServers => ({
  path: '/p/app',
  local: { db: { command: 'npx', args: ['pg-mcp'] } },
  mcpJson: {
    mcpServers: {
      sentry: { type: 'sse', url: 'https://mcp.sentry.dev/sse' },
      local: { command: './bin/mcp', args: ['./s.js', '${X}'], env: { K: '${X}' } },
      rejected: { command: 'evil' },
      chatkepr: { command: 'node', args: ['other.js'] },
    },
  },
  approvals: { enabled: new Set(['sentry']), disabled: new Set(['rejected']), all: false },
  ...overrides,
})

const byName = (found: ReturnType<typeof findServers>) =>
  Object.fromEntries(
    found.map(({ candidate }) => [`${candidate.scope}:${candidate.name}`, candidate]),
  )

describe('findServers', () => {
  const found = findServers(userConfig, [app()], new Set(['snakein']))
  const candidates = byName(found)

  it('берёт команды и адреса из всех областей; незнакомый вид и отклонённые - нет', () => {
    expect(Object.keys(candidates)).toEqual([
      'user:chatkepr',
      'user:snakein',
      'user:keyed',
      'user:notion',
      'user:my_server',
      'user:почта',
      'local:db',
      'project:sentry',
      'project:local',
      'project:chatkepr',
    ])
  })

  it('ключи в аргументах замаскированы; вход по заголовку - без входа в браузере', () => {
    expect(candidates['user:chatkepr']?.target).not.toContain('secret')
    expect(candidates['user:chatkepr']?.target).toMatch(/^WP_ARCHIVE_TOKEN=••• node /)
    expect(candidates['user:keyed']?.needsSignIn).toBe(false)
    expect(candidates['user:notion']?.needsSignIn).toBe(true)
  })

  it('итоговое имя видно; занятое, повтор и невозможное имя - помечены', () => {
    expect(candidates['user:my_server']).toMatchObject({ serverName: 'my-server', blocked: null })
    expect(candidates['user:snakein']?.blocked).toBe('taken')
    expect(candidates['project:chatkepr']?.blocked).toBe('duplicate')
    expect(candidates['user:почта']).toMatchObject({ serverName: '', blocked: 'bad-name' })
  })

  it('сервер .mcp.json без одобрения в Claude Code - помечен, одобренный - нет', () => {
    expect(candidates['project:sentry']?.pending).toBe(false)
    expect(candidates['project:local']?.pending).toBe(true)
    expect(candidates['user:chatkepr']?.pending).toBe(false)
  })

  it('«одобрить все» в Claude Code снимает пометку', () => {
    const all = byName(
      findServers({}, [app({ approvals: { ...noApprovals, all: true } })], new Set()),
    )

    expect(all['project:local']?.pending).toBe(false)
  })

  it('.mcp.json недоверенной папки не читается (null)', () => {
    const untrusted = findServers({}, [app({ mcpJson: null })], new Set())

    expect(untrusted.map(({ candidate }) => candidate.scope)).toEqual(['local'])
  })
})

describe('importedConnector', () => {
  const env = { HOME: '/Users/me', X: 'from-shell', K_KEY: 'k1' }
  const found = findServers(userConfig, [app()], new Set())
  const pick = (key: string) =>
    found.find(({ candidate }) => `${candidate.scope}:${candidate.name}` === key)!

  it('команда: env - в секреты, ключ из аргументов - в секреты, в реестре - маска', () => {
    expect(importedConnector(pick('user:chatkepr'), 'id', 'none', env)).toMatchObject({
      connector: {
        serverName: 'chatkepr',
        command: { command: 'node', args: ['/x/mcp/index.js', '--api-key', '•••'], cwd: null },
        availability: { mode: 'all' },
      },
      secrets: {
        env: { WP_ARCHIVE_TOKEN: 't' },
        command: { args: ['/x/mcp/index.js', '--api-key', 'secret'] },
      },
    })
  })

  it('свой сервер проекта: ${X} раскрыт из оболочки только в хранилище, папка запуска - проект', () => {
    expect(importedConnector(pick('project:local'), 'id', 'none', env)).toMatchObject({
      connector: {
        command: { command: './bin/mcp', args: ['./s.js', '${X}'], cwd: '/p/app' },
        availability: { mode: 'only', projects: ['/p/app'] },
      },
      secrets: {
        env: { K: 'from-shell' },
        command: { command: './bin/mcp', args: ['./s.js', 'from-shell'] },
      },
    })
  })

  it('переменной нет в оболочке - не берётся, а не уходит строкой «${X}»', () => {
    expect(importedConnector(pick('project:local'), 'id', 'none', { HOME: '/h' })).toBe('variable')
  })

  it('адрес: Bearer - ключ, свой заголовок входа - без OAuth, без заголовков - что показала проба', () => {
    expect(importedConnector(pick('user:snakein'), 'id', 'oauth', env)).toMatchObject({
      connector: { auth: 'token', url: 'https://snakein.com/api/mcp' },
      secrets: { bearer: 'snk_1', headers: { 'X-Team': 'a' } },
    })
    expect(importedConnector(pick('user:keyed'), 'id', 'oauth', env)).toMatchObject({
      connector: { auth: 'none' },
      secrets: { headers: { 'X-API-Key': 'k1' } },
    })
    expect(importedConnector(pick('user:notion'), 'id', 'oauth', env)).toMatchObject({
      connector: { auth: 'oauth', transport: 'http' },
    })
    expect(importedConnector(pick('project:sentry'), 'id', 'none', env)).toMatchObject({
      connector: { auth: 'none', transport: 'sse' },
    })
  })
})

describe('withImportType', () => {
  const prepared = (serverName: string): NewConnector => ({
    connector: {
      ...blankConnector({ id: serverName, kind: 'command', label: serverName, serverName }),
      command: { command: 'npx', args: ['@playwright/mcp'], cwd: null },
    },
    secrets: { env: { A: '1' }, bearer: 'own' },
  })

  it('первый из группы заводит тип «несколько раз», следующий встаёт к нему', () => {
    const group = { base: 'playwright', label: '1' }
    const first = withImportType(prepared('playwright-1'), group, { typeId: 't', existing: false })

    expect(first).toMatchObject({
      connector: { typeId: 't', label: '1', serverName: 'playwright-1' },
      type: {
        stored: { id: 't', name: 'Playwright', multiple: true, serverBase: 'playwright' },
        secrets: { env: { A: '1' } },
      },
    })
    expect(
      withImportType(
        prepared('playwright-2'),
        { ...group, label: '2' },
        { typeId: 't', existing: true },
      ),
    ).toEqual({
      connector: expect.objectContaining({ typeId: 't', label: '2' }) as unknown,
      secrets: { env: { A: '1' }, bearer: 'own' },
    })
  })

  it('один - тип «один раз» с именем из имени сервера, без подписи', () => {
    expect(
      withImportType(prepared('notion-web'), null, { typeId: 'n', existing: false }),
    ).toMatchObject({
      connector: { typeId: 'n', label: '', serverName: 'notion-web' },
      type: { stored: { name: 'Notion Web', multiple: false, serverBase: 'notion-web' } },
    })
  })
})

describe('expandConfigVariables', () => {
  it('${NAME} и ${NAME:-запасное}, как у Claude Code', () => {
    expect(expandConfigVariables('${A}/${B:-b}/${C:-c}', { A: 'a', C: '' })).toBe('a/b/c')
    expect(() => expandConfigVariables('${NOPE}', {})).toThrow()
  })
})
