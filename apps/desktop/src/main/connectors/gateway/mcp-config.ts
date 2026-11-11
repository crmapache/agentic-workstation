import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Сервер шлюза, как его надо прописать провайдеру. */
export type GatewayEntry = { name: string; url: string }

/**
 * Конфиг для `claude --mcp-config` одного процесса разговора: коннекторы его проекта -
 * HTTP-серверы шлюза с ключом этого процесса. Ключ в заголовке, а не в адресе: адрес CLI
 * показывает в /mcp и в журналах. Знака «$» в файле нет (имена - латиница и дефис, ключ -
 * base64url), так что подстановка переменных окружения CLI в нём ничего не меняет.
 */
export const claudeMcpConfig = (entries: readonly GatewayEntry[], token: string) => ({
  mcpServers: Object.fromEntries(
    entries.map((entry) => [
      entry.name,
      { type: 'http', url: entry.url, headers: { Authorization: `Bearer ${token}` } },
    ]),
  ),
})

/** Записать конфиг: атомарно и с правами 600 - в нём ключ шлюза. */
export const writeMcpConfig = async (path: string, config: unknown): Promise<void> => {
  const temporary = `${path}.tmp`

  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporary, JSON.stringify(config, null, 2), { mode: 0o600 })
  await rename(temporary, path)
}
