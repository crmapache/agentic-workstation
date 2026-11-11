import { it, expect, describe } from 'vitest'

import { CONNECTOR_DESCRIPTION_MAX } from '@shared/connectors'

import { parseStoredConnectors } from './connector-store'

const gmail = {
  id: 'a',
  kind: 'gmail',
  label: 'Work',
  serverName: 'gmail-work',
  account: 'me@work.com',
  enabled: true,
  toolOverrides: { send_draft: true, bad: 'yes' },
  tools: [{ name: 'search_threads', description: 'Search', access: 'read' }, { nope: 1 }],
}

describe('parseStoredConnectors', () => {
  it('пустой или битый файл - пустой реестр', () => {
    const empty = { connectors: [], types: [], googleClientId: null }

    expect(parseStoredConnectors(null)).toEqual(empty)
    expect(parseStoredConnectors({ connectors: 'x' })).toEqual(empty)
  })

  it('читает коннектор и отбрасывает битые части', () => {
    const { connectors } = parseStoredConnectors({ connectors: [gmail] })

    expect(connectors).toEqual([
      {
        ...gmail,
        typeId: null,
        description: '',
        url: null,
        auth: null,
        transport: null,
        command: null,
        spec: null,
        availability: { mode: 'all' },
        toolOverrides: { send_draft: true },
        tools: [{ name: 'search_threads', description: 'Search', access: 'read' }],
      },
    ])
  })

  it('повтор имени сервера и свой MCP без адреса отбрасываются', () => {
    const { connectors } = parseStoredConnectors({
      connectors: [
        gmail,
        { ...gmail, id: 'b' },
        { id: 'c', kind: 'mcp', label: 'X', serverName: 'mcp-x' },
        { id: 'd', kind: 'mcp', label: 'Y', serverName: 'mcp-y', url: 'https://y.dev/mcp' },
      ],
    })

    expect(connectors.map((connector) => connector.id)).toEqual(['a', 'd'])
    expect(connectors[1]?.auth).toBe('oauth')
  })

  it('описание - строка не длиннее потолка, доступность без режима only - во всех', () => {
    const [connector] = parseStoredConnectors({
      connectors: [{ ...gmail, description: 'x'.repeat(5000), availability: { mode: 'x' } }],
    }).connectors

    expect(connector?.description).toHaveLength(CONNECTOR_DESCRIPTION_MAX)
    expect(connector?.availability).toEqual({ mode: 'all' })
  })

  it('свои типы: битый пропускается, ссылка на пропавший тип снимается', () => {
    const type = {
      id: 't1',
      kind: 'command',
      name: 'Playwright',
      multiple: true,
      serverBase: 'playwright',
      command: { command: 'npx', args: ['-y', '@playwright/mcp'] },
    }
    const command = { ...gmail, kind: 'command', command: type.command }
    const { connectors, types } = parseStoredConnectors({
      connectors: [
        { ...command, id: 'a', serverName: 'playwright-1', typeId: 't1' },
        { ...command, id: 'b', serverName: 'chatkepr', typeId: 'gone' },
        { ...gmail, id: 'c', serverName: 'gmail-x', typeId: 't1' },
      ],
      types: [type, { ...type, id: 't2', name: ' ' }, { ...type, id: 't3', command: null }],
    })

    expect(types.map((item) => item.id)).toEqual(['t1'])
    expect(types[0]).toMatchObject({ multiple: true, url: null, command: { cwd: null } })
    // У встроенного типа своего типа не бывает, даже если файл говорит иное.
    expect(connectors.map((item) => item.typeId)).toEqual(['t1', null, null])
  })

  it('у Todoist вход всегда по токену, у встроенных без адреса способа входа нет', () => {
    const { connectors } = parseStoredConnectors({
      connectors: [
        { ...gmail, id: 't', kind: 'todoist', serverName: 'todoist-main', auth: 'oauth' },
        { ...gmail, id: 'j', kind: 'atlassian', serverName: 'atlassian-x', auth: 'token' },
      ],
    })

    expect(connectors.map((connector) => connector.auth)).toEqual(['token', null])
  })

  it('незнакомый тип пропускается', () => {
    const { connectors } = parseStoredConnectors({
      connectors: [{ ...gmail, kind: 'fax' }],
      googleClientId: 'id.apps.googleusercontent.com',
    })

    expect(connectors).toEqual([])
  })
})
