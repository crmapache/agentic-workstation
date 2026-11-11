import { it, expect, describe } from 'vitest'

import { newConnector, newConnection } from './connector-add'
import type { NewConnector } from './connector-add'
import type { StoredType } from './connector-store'

const none = { servers: new Set<string>(), bases: new Set<string>() }

const ids = { connector: 'c1', type: 't1' }

/** Свой тип «один раз» с этим именем: подпись не нужна. */
const once = { name: 'Linear', multiple: false, label: '' }

describe('newConnector', () => {
  it('Gmail - имя сервера из подписи, подпись с заглавной, секретов и типа нет', () => {
    const result = newConnector({ kind: 'gmail', label: ' work ' }, ids, none)

    expect(result).toMatchObject({
      connector: { id: 'c1', kind: 'gmail', typeId: null, label: 'Work', serverName: 'gmail-work' },
      secrets: {},
    })
    expect((result as NewConnector).type).toBeUndefined()
  })

  it('подпись без латиницы и занятое имя - отказ', () => {
    expect(newConnector({ kind: 'notion', label: 'личный' }, ids, none)).toBe('bad-label')
    expect(
      newConnector({ kind: 'notion', label: 'Home' }, ids, {
        ...none,
        servers: new Set(['notion-home']),
      }),
    ).toBe('name-taken')
  })

  it('Slack - нужен свой app, он ложится в секреты клиентом OAuth', () => {
    expect(
      newConnector({ kind: 'slack', label: 'W', clientId: 'id', clientSecret: ' ' }, ids, none),
    ).toBe('missing-secret')
    expect(
      newConnector({ kind: 'slack', label: 'W', clientId: 'id', clientSecret: 's' }, ids, none),
    ).toMatchObject({ secrets: { client: { client_id: 'id', client_secret: 's' } } })
  })

  it('свой MCP - адрес сайта и ключ, если вход по ключу', () => {
    const mcp = { kind: 'mcp', ...once, url: 'https://mcp.linear.app/mcp' } as const

    expect(newConnector({ ...mcp, url: 'file:///etc', auth: 'none', token: '' }, ids, none)).toBe(
      'bad-url',
    )
    expect(newConnector({ ...mcp, auth: 'token', token: '' }, ids, none)).toBe('missing-secret')
    expect(newConnector({ ...mcp, auth: 'token', token: 'k' }, ids, none)).toMatchObject({
      connector: { url: mcp.url, auth: 'token', serverName: 'linear', typeId: 't1', label: '' },
      secrets: { bearer: 'k' },
      // Ключ входа - у подключения, а не у образца типа.
      type: { stored: { id: 't1', name: 'Linear', serverBase: 'linear' }, secrets: {} },
    })
  })

  it('ключ из адреса своего MCP уходит в секреты подключения и образца, в реестре - без него', () => {
    const result = newConnector(
      { kind: 'mcp', ...once, url: 'https://x.dev/mcp?api_key=k', auth: 'none', token: '' },
      ids,
      none,
    )

    expect(result).toMatchObject({
      connector: { url: 'https://x.dev/mcp' },
      secrets: { url: 'https://x.dev/mcp?api_key=k' },
      type: {
        stored: { url: 'https://x.dev/mcp' },
        secrets: { url: 'https://x.dev/mcp?api_key=k' },
      },
    })
  })

  it('http на чужой хост - отказ, на свою машину - можно', () => {
    const mcp = { kind: 'mcp', ...once, auth: 'none', token: '' } as const

    expect(newConnector({ ...mcp, url: 'http://example.com/mcp' }, ids, none)).toBe('bad-url')
    expect(newConnector({ ...mcp, url: 'http://localhost:4000/mcp' }, ids, none)).toMatchObject({
      connector: { url: 'http://localhost:4000/mcp' },
    })
  })

  it('свой тип: имя с заглавной, «несколько раз» - имя сервера с подписью', () => {
    const command = { kind: 'command', commandLine: 'npx -y @playwright/mcp', envLine: '' } as const
    const result = newConnector(
      { ...command, name: ' playwright ', multiple: true, label: '1' },
      ids,
      none,
    )

    expect(result).toMatchObject({
      connector: { serverName: 'playwright-1', label: '1', typeId: 't1' },
      type: { stored: { name: 'Playwright', multiple: true, serverBase: 'playwright' } },
    })
    expect(
      newConnector({ ...command, name: 'Плейрайт', multiple: false, label: '' }, ids, none),
    ).toBe('bad-name')
    expect(
      newConnector({ ...command, name: 'Playwright', multiple: true, label: ' ' }, ids, none),
    ).toBe('bad-label')
    expect(
      newConnector({ ...command, name: 'Playwright', multiple: true, label: '3' }, ids, {
        ...none,
        bases: new Set(['playwright']),
      }),
    ).toBe('name-taken')
  })

  it('команда: ~ и $NAME раскрыты, ключ из аргументов - в секреты, в реестре - маска', () => {
    const result = newConnector(
      {
        kind: 'command',
        name: 'Tool',
        multiple: false,
        label: '',
        commandLine: 'node ~/tool/index.js --api-key $TOOL_KEY',
        envLine: 'DIR=~/data',
      },
      ids,
      none,
      { HOME: '/Users/me', TOOL_KEY: 'k-123' },
    )
    const secrets = {
      env: { DIR: '/Users/me/data' },
      command: { command: 'node', args: ['/Users/me/tool/index.js', '--api-key', 'k-123'] },
    }

    expect(result).toMatchObject({
      connector: {
        command: {
          command: 'node',
          args: ['~/tool/index.js', '--api-key', '•••'],
          cwd: null,
        },
      },
      secrets,
      type: { stored: { command: { args: ['~/tool/index.js', '--api-key', '•••'] } }, secrets },
    })
  })

  it('значение переменной в реестр не попадает, даже короткое: там - как написал человек', () => {
    const result = newConnector(
      {
        kind: 'command',
        name: 'Db',
        multiple: false,
        label: '',
        commandLine: 'node server.js ${DB_PASS}',
        envLine: '',
      },
      ids,
      none,
      { HOME: '/h', DB_PASS: 'p1' },
    )

    expect(result).toMatchObject({
      connector: { command: { args: ['server.js', '${DB_PASS}'] } },
      secrets: { command: { args: ['server.js', 'p1'] } },
    })
  })

  it('команда с неизвестной переменной - отказ', () => {
    expect(
      newConnector(
        {
          kind: 'command',
          name: 'T',
          multiple: false,
          label: '',
          commandLine: 'node $NOPE',
          envLine: '',
        },
        ids,
        none,
        { HOME: '/h' },
      ),
    ).toBe('bad-command')
  })
})

describe('newConnector - Todoist и Jira & Confluence', () => {
  it('Todoist - вход по токену: без токена отказ, с токеном - ключ в секретах', () => {
    expect(newConnector({ kind: 'todoist', label: 'Main', token: ' ' }, ids, none)).toBe(
      'missing-secret',
    )
    expect(newConnector({ kind: 'todoist', label: 'Main', token: ' t ' }, ids, none)).toMatchObject(
      {
        connector: { kind: 'todoist', serverName: 'todoist-main', auth: 'token', typeId: null },
        secrets: { bearer: 't' },
      },
    )
  })

  it('Jira & Confluence - как Notion: имя сервера с типом, секретов нет до входа в браузере', () => {
    expect(newConnector({ kind: 'atlassian', label: 'reclick' }, ids, none)).toMatchObject({
      connector: {
        kind: 'atlassian',
        serverName: 'atlassian-reclick',
        label: 'Reclick',
        auth: null,
      },
      secrets: {},
    })
  })
})

describe('newConnector - Playwright', () => {
  const request = {
    kind: 'playwright',
    label: 'notion web',
    profile: 'saved',
    profileDir: '~/profiles/notion',
    headless: true,
    version: '0.0.78',
  } as const

  it('команда из настроек, ~ раскрыт из оболочки, имя сервера - тип и подпись', () => {
    expect(newConnector(request, ids, none, { HOME: '/Users/me' })).toMatchObject({
      connector: {
        kind: 'playwright',
        typeId: null,
        label: 'Notion web',
        serverName: 'playwright-notion-web',
        command: {
          command: 'npx',
          args: [
            '-y',
            '@playwright/mcp@0.0.78',
            '--user-data-dir',
            '/Users/me/profiles/notion',
            '--headless',
          ],
        },
      },
      secrets: {},
    })
  })

  it('чистый профиль и latest по умолчанию; кривая версия и папка - отказ', () => {
    expect(
      newConnector({ ...request, profile: 'isolated', version: ' ', headless: false }, ids, none),
    ).toMatchObject({
      connector: { command: { args: ['-y', '@playwright/mcp@latest', '--isolated'] } },
    })
    expect(newConnector({ ...request, version: '1; rm' }, ids, none)).toBe('bad-version')
    expect(newConnector({ ...request, profileDir: 'profiles' }, ids, none)).toBe('bad-profile')
  })
})

describe('newConnection', () => {
  const type: StoredType = {
    id: 't1',
    kind: 'mcp',
    name: 'Linear',
    multiple: true,
    serverBase: 'linear',
    url: 'https://mcp.linear.app/mcp',
    auth: 'token',
    transport: 'http',
    command: null,
    spec: null,
  }
  const request = { typeId: 't1', label: 'work', token: 'k2', secret: '', username: '' }

  it('копия образца и его секретов, свой ключ и имя сервера с подписью', () => {
    expect(newConnection(type, { headers: { 'X-Org': 'o' } }, request, 'c2', new Set())).toEqual({
      connector: expect.objectContaining({
        id: 'c2',
        typeId: 't1',
        kind: 'mcp',
        label: 'Work',
        serverName: 'linear-work',
        url: type.url,
        auth: 'token',
      }) as unknown,
      secrets: { headers: { 'X-Org': 'o' }, bearer: 'k2' },
    })
  })

  it('без своего ключа, без подписи, занятое имя, тип «один раз» - отказ', () => {
    expect(newConnection(type, {}, { ...request, token: ' ' }, 'c', new Set())).toBe(
      'missing-secret',
    )
    expect(newConnection(type, {}, { ...request, label: '' }, 'c', new Set())).toBe('bad-label')
    expect(newConnection(type, {}, request, 'c', new Set(['linear-work']))).toBe('name-taken')
    expect(newConnection({ ...type, multiple: false }, {}, request, 'c', new Set())).toBe(
      'bad-label',
    )
  })
})
