import type { OutsideCopy } from '@shared/connectors'

/** Имя сервера у чужого клиента: по нему человек узнает IDE в своём списке серверов. */
const CLIENT_NAME = 'agentic-workstation'

/**
 * Готовый текст для чужого клиента: команда Claude Code (`claude mcp add`), запись
 * `~/.codex/config.toml` или JSON, который понимают Cursor, `.mcp.json` и другие клиенты. Ключ -
 * заголовком Authorization: так его берут все три. Claude Code 2.1.293 подключился по команде
 * (`claude mcp list`), Codex 0.163 читает запись с заголовком (`codex mcp get`).
 */
export const outsideSetup = (what: OutsideCopy, url: string, key: string): string => {
  const header = `Authorization: Bearer ${key}`

  switch (what) {
    case 'claude':
      return `claude mcp add --transport http --scope user ${CLIENT_NAME} ${url} --header "${header}"`
    case 'codex':
      return [
        `[mcp_servers.${CLIENT_NAME}]`,
        `url = "${url}"`,
        `http_headers = { "Authorization" = "Bearer ${key}" }`,
      ].join('\n')
    case 'json':
      return JSON.stringify(
        {
          mcpServers: {
            [CLIENT_NAME]: { type: 'http', url, headers: { Authorization: `Bearer ${key}` } },
          },
        },
        null,
        2,
      )
  }
}
