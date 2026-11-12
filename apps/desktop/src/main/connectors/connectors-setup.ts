import { join } from 'node:path'

import { app, safeStorage } from 'electron'
import type { BrowserWindow } from 'electron'

import { createBrowserRuntime } from '../browser/browser-setup'
import { broadcast } from '../ipc/broadcast'
import { JsonFile } from '../storage/json-file'
import { openExternalWeb } from '../window/open-external'
import type { AskStructured } from './ai-connector'
import { pickGoogleClientFile } from './connector-dialogs'
import type { StoredConnectors } from './connector-store'
import { ConnectorsService } from './connectors-service'
import { VAULT_FILE, MCP_CONFIG_DIR, CONNECTORS_FILE } from './connectors.constants'
import { Vault } from './vault'
import type { VaultCipher } from './vault'

/** Шифр хранилища - safeStorage Electron: ключ в Keychain самой IDE, не провайдера. */
const ELECTRON_CIPHER: VaultCipher = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (text) => safeStorage.encryptString(text),
  decrypt: (data) => safeStorage.decryptString(data),
}

/** Что коннекторам надо от провайдеров: перезапустить процессы или переподключить сервер. */
export type ProviderLinks = {
  serversChanged: (affects: (projectPath: string) => boolean) => void
  serverChanged: (serverName: string) => void
  getWindow: () => BrowserWindow | null
  /** Окружение оболочки входа - для MCP-команд (PATH до npx, node). */
  shellEnv: () => Promise<Record<string, string>>
  /** Открытые проекты: импорт предлагает и их MCP-серверы. */
  projectPaths: () => string[]
  /** Доверился ли человек папке проекта (как для разговоров Claude Code). */
  isTrusted: (projectPath: string) => Promise<boolean>
  /** Разовый вопрос к ИИ по схеме: коннектор, который описывает ИИ. */
  ask: AskStructured
}

/**
 * Коннекторы IDE (ADR 0028): реестр и хранилище в userData, шлюз поднят до первого
 * процесса провайдера. Окну - событием, провайдерам - через ProviderLinks: модуль
 * коннекторов о Claude Code не знает.
 */
export const startConnectors = async (links: ProviderLinks): Promise<ConnectorsService> => {
  const userData = app.getPath('userData')
  // Профили Chrome подключились или отключились - окну новое состояние; до загрузки сервиса
  // рассылать нечего.
  let service: ConnectorsService | null = null
  const browser = createBrowserRuntime(() => {
    if (service) broadcast('connectors:state', service.getState())
  })
  const connectors = await ConnectorsService.load(
    {
      // Права 600: ключей в реестре нет, но адреса, команды и почты - тоже не для чужих глаз.
      file: new JsonFile<StoredConnectors>(join(userData, CONNECTORS_FILE), { mode: 0o600 }),
      vault: await Vault.load(join(userData, VAULT_FILE), ELECTRON_CIPHER),
      mcpConfigDir: join(userData, MCP_CONFIG_DIR),
      shellEnv: links.shellEnv,
      projectPaths: links.projectPaths,
      isTrusted: links.isTrusted,
      ask: links.ask,
      version: app.getVersion(),
      browser,
    },
    {
      onState: (state) => broadcast('connectors:state', state),
      onServersChanged: links.serversChanged,
      onServerChanged: links.serverChanged,
      openExternal: openExternalWeb,
      pickGoogleClientFile: () => pickGoogleClientFile(links.getWindow()),
    },
  )

  service = connectors
  await connectors.start()

  return connectors
}
