import type { ConnectorsState } from '@shared/connectors'

import type { JsonFile } from '../storage/json-file'
import type { AskStructured } from './ai-connector'
import type { StoredConnectors } from './connector-store'
import type { Vault } from './vault'

export type ConnectorsPlaces = {
  file: JsonFile<StoredConnectors>
  vault: Vault
  /** Папка файлов `--mcp-config` по проектам. */
  mcpConfigDir: string
  /** Окружение оболочки входа - для MCP-команд. */
  shellEnv: () => Promise<Record<string, string>>
  /** Открытые проекты: импорт предлагает и их серверы. */
  projectPaths: () => string[]
  /** Доверился ли человек папке проекта: .mcp.json недоверенной импорт не читает. */
  isTrusted: (projectPath: string) => Promise<boolean>
  /** Разовый вопрос к ИИ по схеме - для коннекторов, которые описывает ИИ. */
  ask: AskStructured
  version: string
}

export type ConnectorsEvents = {
  onState: (state: ConnectorsState) => void
  /**
   * Набор серверов поменялся в проектах, для которых affects - да: их процессы перечитают
   * его только при старте.
   */
  onServersChanged: (affects: (projectPath: string) => boolean) => void
  /** Внутри сервера поменялось (вход, инструменты): живые процессы переподключают его. */
  onServerChanged: (serverName: string) => void
  openExternal: (url: string) => boolean
  /** Системный выбор файла клиента Google. Отмена - null. */
  pickGoogleClientFile: () => Promise<string | null>
}
