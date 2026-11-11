import { homedir } from 'node:os'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import type { SecretsOf } from '../connector-secrets'
import type { StoredCommand } from '../connector-store'
import { CLIENT_NAME } from '../connectors.constants'
import { ClientSource } from './client-source'

export type StdioMcpOptions = {
  /** Команда читается на каждом запуске: полная, с ключами, лежит в хранилище. */
  command: () => StoredCommand | null
  /** Папка запуска, если у команды нет своей: проект разговора. null - домашняя. */
  cwd: string | null
  secrets: SecretsOf
  /** Окружение оболочки входа: без её PATH не найдутся npx, node и uvx. */
  shellEnv: () => Promise<Record<string, string>>
  version: string
}

/**
 * MCP-сервер командой на этой машине (chatkepr, Playwright, свой скрипт). Процесс
 * поднимается по первому запросу и гасится вместе с источником: общий для всех разговоров
 * или свой у каждого - решает LiveConnector. Упал - следующий запрос поднимет заново.
 * Переменные окружения с ключами лежат в хранилище IDE, а не в конфиге. Папка запуска -
 * папка проекта у своего сервера проекта (относительные пути в его команде - от неё),
 * иначе домашняя.
 */
export class StdioMcpSource extends ClientSource {
  constructor(private readonly options: StdioMcpOptions) {
    super()
  }

  protected override async open(): Promise<Client> {
    const { secrets, shellEnv, version } = this.options
    const command = this.options.command()

    if (!command) throw new Error('У коннектора нет команды')

    const transport = new StdioClientTransport({
      command: command.command,
      args: command.args,
      env: { ...(await shellEnv()), ...(secrets.read().env ?? {}) },
      cwd: command.cwd ?? this.options.cwd ?? homedir(),
      stderr: 'ignore',
    })
    const client = new Client({ name: CLIENT_NAME, version })

    await client.connect(transport)

    return client
  }
}
