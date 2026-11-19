import { it, expect, describe } from 'vitest'

import { connectorArgs, userServersOf } from './codex-connectors'

describe('коннекторы IDE в Codex', () => {
  it('сервер - целиком встроенной таблицей: шлюз с ключом из окружения, сервер человека выключен', () => {
    expect(
      connectorArgs(
        [{ name: 'gmail', url: 'http://127.0.0.1:5000/mcp/gmail' }],
        [
          { name: 'Notion', transport: 'url="https://mcp.notion.com/mcp"' },
          { name: 'gmail', transport: 'url="https://other"' },
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
