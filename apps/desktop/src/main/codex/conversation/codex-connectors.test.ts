import { it, expect, describe } from 'vitest'

import { connectorArgs, userServersOf, codexServerNames } from './codex-connectors'

describe('коннекторы IDE в Codex', () => {
  it('сервер - целиком встроенной таблицей: шлюз с ключом из окружения, серверы человека выключены', () => {
    expect(
      connectorArgs(
        [{ name: 'gmail', url: 'http://127.0.0.1:5000/mcp/gmail' }],
        [
          { name: 'Notion', transport: 'url="https://mcp.notion.com/mcp"' },
          { name: 'bad name', transport: 'url="https://x"' },
        ],
      ),
    ).toEqual([
      '-c',
      'mcp_servers.gmail={url="http://127.0.0.1:5000/mcp/gmail", bearer_token_env_var="AGENTIC_WORKSTATION_GATEWAY_TOKEN"}',
      '-c',
      'mcp_servers.Notion={url="https://mcp.notion.com/mcp", enabled=false}',
    ])
  })

  it('имя занято сервером человека - сервер IDE под своим, его сервер всё равно выключен', () => {
    // Флаг сливается с таблицей из конфига: адрес шлюза рядом с его командой Codex не поднял бы.
    expect(
      connectorArgs(
        [{ name: 'context7', url: 'http://127.0.0.1:5000/mcp/context7' }],
        [{ name: 'context7', transport: 'command="npx", args=["-y","@upstash/context7-mcp"]' }],
      ),
    ).toEqual([
      '-c',
      'mcp_servers.context7-ide={url="http://127.0.0.1:5000/mcp/context7", bearer_token_env_var="AGENTIC_WORKSTATION_GATEWAY_TOKEN"}',
      '-c',
      'mcp_servers.context7={command="npx", args=["-y","@upstash/context7-mcp"], enabled=false}',
    ])
  })

  it('своё имя - мимо занятых человеком и шлюзом', () => {
    const names = codexServerNames(
      [
        { name: 'shotter', url: 'http://a' },
        { name: 'shotter-ide-2', url: 'http://b' },
        { name: 'gmail-work', url: 'http://c' },
      ],
      [
        { name: 'shotter', transport: 'command="x"' },
        { name: 'shotter-ide', transport: 'command="y"' },
      ],
    )

    expect([...names]).toEqual([
      ['shotter', 'shotter-ide-3'],
      ['shotter-ide-2', 'shotter-ide-2'],
      ['gmail-work', 'gmail-work'],
    ])
  })

  it('только чтение: у сервера шлюза - свои инструменты, сервер без них не идёт', () => {
    expect(
      connectorArgs(
        [
          { name: 'gmail', url: 'http://127.0.0.1:5000/mcp/gmail' },
          { name: 'slack', url: 'http://127.0.0.1:5000/mcp/slack' },
        ],
        [{ name: 'gmail', transport: 'url="https://other"' }],
        new Map([['gmail', ['search', 'read']]]),
      ),
    ).toEqual([
      '-c',
      'mcp_servers.gmail-ide={url="http://127.0.0.1:5000/mcp/gmail", bearer_token_env_var="AGENTIC_WORKSTATION_GATEWAY_TOKEN", enabled_tools=["search","read"]}',
      '-c',
      'mcp_servers.gmail={url="https://other", enabled=false}',
    ])
  })

  it('допуск шлюза: выданные инструменты Codex не спрашивает (approve)', () => {
    expect(
      connectorArgs(
        [{ name: 'browser-chrome', url: 'http://127.0.0.1:5000/mcp/browser-chrome' }],
        [],
        new Map([['browser-chrome', ['open', 'snapshot']]]),
        true,
      ),
    ).toEqual([
      '-c',
      'mcp_servers.browser-chrome={url="http://127.0.0.1:5000/mcp/browser-chrome", bearer_token_env_var="AGENTIC_WORKSTATION_GATEWAY_TOKEN", enabled_tools=["open","snapshot"], default_tools_approval_mode="approve"}',
    ])
  })

  it('серверы человека из `codex mcp list --json`: адрес или команда; без транспорта и мусор - мимо', () => {
    expect(
      userServersOf(
        JSON.stringify([
          {
            name: 'Notion',
            transport: { type: 'streamable_http', url: 'https://mcp.notion.com/mcp' },
          },
          { name: 'local', transport: { type: 'stdio', command: '/bin/x', args: ['a', 'b'] } },
          { name: 'odd', transport: {} },
        ]),
      ),
    ).toEqual([
      { name: 'Notion', transport: 'url="https://mcp.notion.com/mcp"' },
      { name: 'local', transport: 'command="/bin/x", args=["a","b"]' },
    ])
    expect(userServersOf('not json')).toBeNull()
    expect(userServersOf('{}')).toBeNull()
  })
})
