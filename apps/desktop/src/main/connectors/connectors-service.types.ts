import type { FeedPatch } from '@shared/claude-feed'
import type { ConnectorsState } from '@shared/connectors'

import type { BrowserRuntime } from '../browser/browser-runtime'
import type { JsonFile } from '../storage/json-file'
import type { StoredConnectors } from './connector-store'
import type { Vault } from './vault'
import type { OpenAiChat } from './ai/ai-chat'
import type { StoredAiJobs } from './ai/ai-jobs-file'

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
  /** Разговор с ИИ о новом коннекторе (ADR 0050): его ведёт провайдер. */
  chats: OpenAiChat
  /** Работы ИИ на диске: готовое и начатое переживает перезапуск IDE. */
  aiJobsFile: JsonFile<StoredAiJobs>
  version: string
  /** Мост в Chrome для коннектора Browser (ADR 0040). */
  browser: BrowserRuntime
}

export type ConnectorsEvents = {
  onState: (state: ConnectorsState) => void
  /** Лента разговора работы ИИ поменялась. */
  onAiJobFeed: (jobId: string, patch: FeedPatch) => void
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
