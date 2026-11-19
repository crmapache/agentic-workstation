import type { OutsideCopy } from '@shared/connectors'

/** Имя сервера у чужого клиента: по нему человек узнает IDE в своём списке серверов. */
const CLIENT_NAME = 'agentic-workstation'

/**
 * Готовый текст для чужого клиента: команда Claude Code (`claude mcp add`), запись
 * `~/.codex/config.toml`, команда Antigravity CLI (`agy mcp add`), запись Kimi Code
 * `~/.kimi-code/mcp.json` или JSON, который понимают Cursor, `.mcp.json` и другие клиенты. Ключ -
 * заголовком Authorization: так его берут все. Claude Code 2.1.293 подключился по команде
 * (`claude mcp list`), Codex 0.163 читает запись с заголовком (`codex mcp get`), agy 1.5.12
 * записал команду в `mcp_config.json` временной папки (`--gemini_dir`) адресом `serverUrl` с
 * заголовком. У Kimi Code 2.7.0 команды добавить сервер нет (только `/mcp-config` внутри
 * разговора), поэтому - запись в его файл: HTTP он узнаёт по `url` без `transport`.
 */
export const outsideSetup = (what: OutsideCopy, url: string, key: string): string => {
  const header = `Authorization: Bearer ${key}`
  const headers = { Authorization: `Bearer ${key}` }

  switch (what) {
    case 'claude':
      return `claude mcp add --transport http --scope user ${CLIENT_NAME} ${url} --header "${header}"`
    case 'codex':
      return [
        `[mcp_servers.${CLIENT_NAME}]`,
        `url = "${url}"`,
        `http_headers = { "Authorization" = "Bearer ${key}" }`,
      ].join('\n')
    // Флаги agy принимает только до имени сервера: после имени он их отвергает.
    case 'antigravity':
      return `agy mcp add --header "${header}" ${CLIENT_NAME} ${url}`
    case 'kimi':
      return JSON.stringify({ mcpServers: { [CLIENT_NAME]: { url, headers } } }, null, 2)
    case 'json':
      return JSON.stringify(
        { mcpServers: { [CLIENT_NAME]: { type: 'http', url, headers } } },
        null,
        2,
      )
  }
}
