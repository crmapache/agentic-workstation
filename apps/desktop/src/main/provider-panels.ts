import { join } from 'node:path'

import { shell } from 'electron'

import type { AgentPanelState } from '@shared/conversation'
import type { FeedPatch } from '@shared/conversation-feed'
import { KIMI_CAPABILITIES, ANTIGRAVITY_CAPABILITIES } from '@shared/panel-capabilities'
import type { ConversationCall } from '@shared/panel-prefs'
import type { ProviderId } from '@shared/providers'

import type { StoredAcpAccount } from './acp/acp-account'
import { AcpPanel } from './acp/acp-panel'
import { antigravityAgent } from './antigravity/antigravity-agent'
import { ClaudeService } from './claude/claude-service'
import { CodexService } from './codex/codex-service'
import type { ConnectorsService } from './connectors/connectors-service'
import { broadcast } from './ipc/broadcast'
import { kimiAgent } from './kimi/kimi-agent'
import { OpenModelsService } from './opencode/opencode-service'
import type { SoundsService } from './sounds/sounds-service'
import { ELECTRON_CIPHER } from './storage/electron-cipher'
import { JsonFile } from './storage/json-file'
import { Vault } from './storage/vault'
import { openExternalWeb } from './window/open-external'
import { PanelRegistry } from './agents/panel/panel-registry'
import type { StoredPanel } from './agents/panel/panel-state'
import type { StoredAccounts } from './claude/accounts/account-store'
import { CodexAccounts } from './codex/account/codex-accounts'
import type { StoredCodexAccounts } from './codex/account/codex-accounts'
import { ConnectionStore } from './opencode/connections/connection-store'
import type { StoredConnections } from './opencode/connections/connection-store'
import { ModelConnections } from './opencode/connections/model-connections'

/** Подключения моделей панели открытых моделей и их ключи - своими файлами в userData. */
const OPEN_MODELS_FILE = 'open-models.json'
const OPEN_MODELS_VAULT = 'open-models.vault'

/**
 * Кому сверх окна нужны события панелей: статистика, Remote Control, локальная история. Они
 * поднимаются позже панелей, поэтому их зовут через функции, а не берут готовыми.
 */
export type PanelObservers = {
  /** Состояние панели любого провайдера: список провайдеров, статистика, Remote Control. */
  state: (provider: ProviderId, state: AgentPanelState) => void
  /**
   * Заплатка ленты любого провайдера: локальной истории (правки агента), телефону и капсуле
   * Computer. id разговора - UUID вкладки, по нему и находят его панель.
   */
  feed: (patch: FeedPatch) => void
  /** Разговор любого провайдера позвал человека: телефону - каждый повод, и выключенный в звуках. */
  call: (call: ConversationCall) => void
}

export type ProviderPanels = {
  claude: ClaudeService
  codex: CodexService
  antigravity: AcpPanel
  kimi: AcpPanel
  openModels: OpenModelsService
  /** Каналы agent:* находят панель по провайдеру. */
  registry: PanelRegistry
}

/**
 * Панели провайдеров ИИ (ADR 0083): Claude Code, Codex и открытые модели (OpenCode, ADR 0084),
 * у каждой свой файл состояния, свои вкладки, настройки и лимиты; события окну - с провайдером. Зов окну - только не выключенный
 * в Settings → Sounds.
 */
export const startProviderPanels = async (options: {
  userData: string
  version: string
  sounds: SoundsService
  observers: PanelObservers
}): Promise<ProviderPanels> => {
  const { userData, sounds, observers } = options
  // Хуки расширений IDE (ADR 0091): связка реестра, пустая, пока расширения не поднялись.
  const registry = new PanelRegistry()
  const claude = await ClaudeService.load(
    new JsonFile<StoredPanel>(join(userData, 'claude.json')),
    {
      onState: (state) => {
        broadcast('agent:state', { provider: 'claude', state })
        observers.state('claude', state)
      },
      onFeed: (patch) => {
        broadcast('agent:feed', { provider: 'claude', patch })
        observers.feed(patch)
      },
      // Телефону - каждый повод, окну - только не выключенный в Settings → Sounds.
      onCall: (call) => {
        observers.call(call)
        if (!sounds.isMuted(call.reason)) broadcast('agent:call', { provider: 'claude', call })
      },
      openPath: (path) => shell.openPath(path),
      hooks: registry.hooks.forPanel('claude'),
    },
    {
      file: new JsonFile<StoredAccounts>(join(userData, 'claude-accounts.json')),
      dir: join(userData, 'claude-accounts'),
    },
  )
  const codexAccounts = await CodexAccounts.load(
    new JsonFile<StoredCodexAccounts>(join(userData, 'codex-accounts.json')),
    join(userData, 'codex-accounts'),
  )
  const codex = await CodexService.load(
    new JsonFile<StoredPanel>(join(userData, 'codex.json')),
    {
      onState: (state) => {
        broadcast('agent:state', { provider: 'codex', state })
        observers.state('codex', state)
      },
      onFeed: (patch) => {
        broadcast('agent:feed', { provider: 'codex', patch })
        observers.feed(patch)
      },
      onCall: (call) => {
        observers.call(call)
        if (!sounds.isMuted(call.reason)) broadcast('agent:call', { provider: 'codex', call })
      },
      openUrl: (url) => openExternalWeb(url),
      hooks: registry.hooks.forPanel('codex'),
    },
    options.version,
    codexAccounts,
  )
  // Подключения моделей зовут панель, когда поменялись, а панель держит их: связь - через let.
  let openModels: OpenModelsService | null = null
  const connections = new ModelConnections(
    await ConnectionStore.load(
      new JsonFile<StoredConnections>(join(userData, OPEN_MODELS_FILE)),
      await Vault.load(join(userData, OPEN_MODELS_VAULT), ELECTRON_CIPHER),
    ),
    () => openModels?.connectionsChanged(),
  )

  openModels = await OpenModelsService.load(
    new JsonFile<StoredPanel>(join(userData, 'opencode.json')),
    {
      onState: (state) => {
        broadcast('agent:state', { provider: 'opencode', state })
        observers.state('opencode', state)
      },
      onFeed: (patch) => {
        broadcast('agent:feed', { provider: 'opencode', patch })
        observers.feed(patch)
      },
      onCall: (call) => {
        observers.call(call)
        if (!sounds.isMuted(call.reason)) broadcast('agent:call', { provider: 'opencode', call })
      },
      onConnections: (state) => broadcast('openModels:connections', state),
      hooks: registry.hooks.forPanel('opencode'),
    },
    connections,
    join(userData, 'opencode'),
  )

  /** События панели агента ACP: окну с провайдером, наблюдателям, звук - если не выключен. */
  const acpEvents = (provider: 'antigravity' | 'kimi') => ({
    onState: (state: AgentPanelState) => {
      broadcast('agent:state', { provider, state })
      observers.state(provider, state)
    },
    onFeed: (patch: FeedPatch) => {
      broadcast('agent:feed', { provider, patch })
      observers.feed(patch)
    },
    onCall: (call: ConversationCall) => {
      observers.call(call)
      if (!sounds.isMuted(call.reason)) broadcast('agent:call', { provider, call })
    },
    hooks: registry.hooks.forPanel(provider),
  })
  const antigravityRoot = join(userData, 'antigravity')
  const antigravity = await AcpPanel.load(
    new JsonFile<StoredPanel>(join(userData, 'antigravity.json')),
    acpEvents('antigravity'),
    {
      agent: antigravityAgent(antigravityRoot),
      capabilities: ANTIGRAVITY_CAPABILITIES,
      root: antigravityRoot,
      version: options.version,
      accountFile: new JsonFile<StoredAcpAccount>(join(antigravityRoot, 'account.json')),
    },
  )
  const kimiRoot = join(userData, 'kimi')
  const kimi = await AcpPanel.load(
    new JsonFile<StoredPanel>(join(userData, 'kimi.json')),
    acpEvents('kimi'),
    {
      agent: kimiAgent(kimiRoot),
      capabilities: KIMI_CAPABILITIES,
      root: kimiRoot,
      version: options.version,
      accountFile: new JsonFile<StoredAcpAccount>(join(kimiRoot, 'account.json')),
    },
  )

  registry.add('claude', claude)
  registry.add('codex', codex)
  registry.add('antigravity', antigravity)
  registry.add('kimi', kimi)
  registry.add('opencode', openModels)
  // Вопрос сбоку (/btw): цепочка вкладки - окну событием, ответы приходят сами.
  claude.panel.aside.onChange = (view) => broadcast('claudePanel:aside', view)

  return { claude, codex, antigravity, kimi, openModels, registry }
}

/**
 * Что коннекторам IDE надо от панелей (ADR 0028, 0029): новый, удалённый или включённый в
 * проекте коннектор перезапускает процессы этих проектов, перемена внутри сервера - их
 * переподключение (у кого как умеет).
 */
export const connectorLinks = (panels: ProviderPanels) => ({
  serversChanged: (affects: (projectPath: string) => boolean) => {
    panels.claude.connectors.serversChanged(affects)
    panels.codex.connectors.serversChanged(affects)
    panels.antigravity.connectors.serversChanged(affects)
    panels.kimi.connectors.serversChanged(affects)
    panels.openModels.connectors.serversChanged(affects)
  },
  serverChanged: (serverName: string) => {
    panels.claude.connectors.serverChanged(serverName)
    panels.codex.connectors.serverChanged()
    panels.antigravity.connectors.serverChanged()
    panels.kimi.connectors.serverChanged()
    panels.openModels.connectors.serverChanged()
  },
})

/**
 * Шлюз коннекторов - процессам панелей: Claude Code получает файл `--mcp-config`, Codex и
 * OpenCode - ключ только в памяти, серверы - флагами и конфигом.
 */
export const attachGateway = (panels: ProviderPanels, connectors: ConnectorsService): void => {
  panels.claude.connectors.configFor = (projectPath, ideServers) =>
    connectors.mcpConfigFor(projectPath, ideServers)
  panels.codex.connectors.configFor = (projectPath, ideServers) =>
    connectors.gatewayFor(projectPath, ideServers)
  panels.antigravity.connectors.configFor = (projectPath, ideServers) =>
    connectors.gatewayFor(projectPath, ideServers)
  panels.kimi.connectors.configFor = (projectPath, ideServers) =>
    connectors.gatewayFor(projectPath, ideServers)
  panels.openModels.connectors.configFor = (projectPath, ideServers) =>
    connectors.gatewayFor(projectPath, ideServers)
}
