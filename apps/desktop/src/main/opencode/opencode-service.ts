import { homedir } from 'node:os'
import { join } from 'node:path'

import type { AccountsState } from '@shared/accounts'
import type { CliStatus, ModelInfo, AgentPanelState } from '@shared/conversation'
import type { FeedPatch } from '@shared/conversation-feed'
import { REASONING_LEVELS, SMALL_CONTEXT_TOKENS } from '@shared/open-models'
import { OPENCODE_CAPABILITIES } from '@shared/panel-capabilities'
import type { PanelPrefs, ConversationCall } from '@shared/panel-prefs'
import type { OpenModelsConnections } from '@shared/ipc/open-models.contract'

import { parseStoredClaude } from '../claude/claude-state'
import type { JsonFile } from '../storage/json-file'
import { makeThumbnail } from '../agents/images/thumbnail'
import type { PanelDriver } from '../agents/panel/agent-panel'
import { AgentPanel } from '../agents/panel/agent-panel'
import { FolderTrust } from '../agents/panel/folder-trust'
import type { ConversationOps } from '../agents/panel/panel-actions'
import type { StoredPanel } from '../agents/panel/panel-state'
import { applyPrefsPatch } from '../claude/settings/panel-prefs'
import type { GatewayLaunch } from '../connectors/gateway/launches'
import type { OpenCodeRunHost } from '../providers/opencode/opencode-run-process'
import { BRIEFING_KEY } from '../providers/opencode/opencode-run-session'
import { withoutRuns } from '../providers/run-stream/run-history'
import { OpenCodeConnectorsBridge } from './opencode-connectors-bridge'
import { OpenCodeCatalog } from './catalog/opencode-catalog'
import { locateOpenCodeCli } from './cli/opencode-locator'
import type { ConnectionInput } from './connections/connection-store'
import type { ModelConnections } from './connections/model-connections'
import { ModelProxy } from './connections/model-proxy'
import { onlyServers } from './connections/only-servers'
import { modelRefOf, openAiBaseUrl, providersConfig } from './connections/opencode-config'
import type { OpenCodeHost, OpenCodeLaunch } from './conversation/opencode-conversation'
import { openCodeOf } from './conversation/opencode-conversation'
import { openCodeDriver } from './conversation/opencode-driver'
import { forkOpenCode } from './conversation/opencode-fork'
import { openCodeLaunch } from './conversation/opencode-launch'
import { rewindOpenCode, previewOpenCodeRewind } from './conversation/opencode-rewind'
import { isSessionOf } from './conversation/session-place'
import type { OpenCodeDirs } from './server/opencode-server'

export type OpenModelsEvents = {
  onState: (state: AgentPanelState) => void
  onFeed: (patch: FeedPatch) => void
  onCall: (call: ConversationCall) => void
  /** Подключения поменялись - окну (экран подключений). */
  onConnections: (connections: OpenModelsConnections) => void
}

/** Уровни и режимы, которые панель принимает с диска и из окна. */
const OPENCODE_RULES = { efforts: REASONING_LEVELS, modes: OPENCODE_CAPABILITIES.modes }

/** Чего у OpenCode нет и что окну всё равно надо отдать пустым. */
const NO_REFUSALS = { bypass: false, autoModels: [] }

/** Аккаунтов у открытых моделей нет: ключи - у подключений. */
const NO_ACCOUNTS: AccountsState = {
  current: '',
  accounts: [],
  importable: [],
  signingIn: null,
  lastOutcome: null,
  usage: {},
}

/**
 * Панель открытых моделей (ADR 0083, 0084, docs/plan-providers/40-open-models.md): разговоры
 * OpenCode во всех проектах на общем ядре панели. Своё - подключения моделей (меню MODEL из
 * них), доверие к папкам, свои папки OpenCode у IDE, состояние в `opencode.json`. Подключения
 * поменялись - живые процессы перезапускаются, как освободятся: модели едут им конфигом.
 */
export class OpenModelsService extends AgentPanel {
  /** Коннекторы IDE для процессов разговоров; шлюз ставит index.ts. */
  readonly connectors = new OpenCodeConnectorsBridge(() => this.runtimes.values())
  /** Прокси облачных подключений: настоящий ключ процессу OpenCode не отдаётся. */
  readonly proxy = new ModelProxy((id) => {
    const connection = this.models.list.find((item) => item.id === id)
    const key = this.models.keyOf(id)

    return connection && key ? { baseUrl: openAiBaseUrl(connection), key } : null
  })
  /** История, имена и форк, когда живой сессии нет; журнал для ленты. */
  readonly catalog = new OpenCodeCatalog({
    cli: () => locateOpenCodeCli(),
    dirs: () => this.dirs(),
    cwd: homedir(),
  })
  private cliStatus: CliStatus = 'unknown'
  private prefs: PanelPrefs
  private readonly trust: FolderTrust
  /** Раздел `providers` последнего конфига: поменялся - процессы перезапускаются. */
  private providersKey = ''

  private constructor(
    stored: StoredPanel,
    file: JsonFile<StoredPanel>,
    private readonly events: OpenModelsEvents,
    readonly models: ModelConnections,
    private readonly root: string,
  ) {
    super(stored, file, { onState: events.onState, onCall: events.onCall })
    this.prefs = stored.prefs
    this.trust = new FolderTrust(stored.trustedProjects, () => this.persist.changed())
    this.restore(stored)
  }

  /** root - папка панели в userData: в ней свои папки OpenCode (конфиг, база, кеш). */
  static async load(
    file: JsonFile<StoredPanel>,
    events: OpenModelsEvents,
    models: ModelConnections,
    root: string,
  ): Promise<OpenModelsService> {
    const stored = parseStoredClaude(await file.read(), { ...OPENCODE_RULES, sessionless: true })
    const service = new OpenModelsService(stored, file, events, models, root)

    void service.refresh()

    return service
  }

  getState(): AgentPanelState {
    return {
      ...this.coreState(),
      builtinCommands: [],
      models: this.menuModels(),
      cli: this.cliStatus,
      accounts: NO_ACCOUNTS,
      prefs: this.prefs,
      refusedModes: NO_REFUSALS,
      capabilities: OPENCODE_CAPABILITIES,
    }
  }

  setPrefs(patch: unknown): AgentPanelState {
    this.prefs = applyPrefsPatch(this.prefs, patch, OPENCODE_RULES)
    this.persist.changed()

    return this.getState()
  }

  /** Лимитов подписки у открытых моделей нет; подключения - своим каналом. */
  refreshUsage(): Promise<AgentPanelState> {
    return Promise.resolve(this.getState())
  }

  // Аккаунтов нет (accounts: 'none'): окно эти действия не показывает.
  signIn = (): Promise<AgentPanelState> => Promise.resolve(this.getState())
  cancelSignIn = (): Promise<AgentPanelState> => Promise.resolve(this.getState())
  checkSignIn = (): Promise<AgentPanelState> => Promise.resolve(this.getState())
  signOut = (): Promise<AgentPanelState> => Promise.resolve(this.getState())
  addAccount = (): Promise<AgentPanelState> => Promise.resolve(this.getState())
  selectAccount = (): Promise<AgentPanelState> => Promise.resolve(this.getState())
  renameAccount = (): Promise<AgentPanelState> => Promise.resolve(this.getState())
  forgetAccount = (): Promise<AgentPanelState> => Promise.resolve(this.getState())

  connectionsState(): OpenModelsConnections {
    return { connections: this.models.list, canStoreKeys: this.models.store.canStoreKeys }
  }

  async refreshConnections(): Promise<OpenModelsConnections> {
    await this.models.refresh()

    return this.connectionsState()
  }

  async addConnection(input: ConnectionInput): Promise<OpenModelsConnections> {
    await this.models.add(input)

    return this.connectionsState()
  }

  async updateConnection(id: string, input: ConnectionInput): Promise<OpenModelsConnections> {
    await this.models.update(id, input)

    return this.connectionsState()
  }

  async removeConnection(id: string): Promise<OpenModelsConnections> {
    await this.models.remove(id)

    return this.connectionsState()
  }

  /**
   * Подключения поменялись (проба ответила, человек правил): окну - новые подключения и меню;
   * процессам - новые модели, перезапуском, как освободятся (модели едут им конфигом).
   */
  connectionsChanged(): void {
    // Что увидит процесс: модели и куда за ними ходить; ключи процесса тут не в счёт.
    const key = JSON.stringify(
      providersConfig(this.models.list, (connection) => ({
        baseURL: `${openAiBaseUrl(connection)} ${this.models.keyOf(connection.id) !== ''}`,
      })),
    )

    this.events.onConnections(this.connectionsState())
    this.scheduleBroadcast()

    if (key === this.providersKey) return

    this.providersKey = key
    for (const runtime of this.runtimes.values()) {
      if (openCodeOf(runtime).live) runtime.restartSession()
    }
  }

  /** OpenCode на месте ли и что отвечают подключения. */
  async refresh(): Promise<void> {
    this.cliStatus = (await locateOpenCodeCli()) ? 'found' : 'missing'
    this.scheduleBroadcast()
    await this.models.refresh()
  }

  protected storedExtras(): Pick<StoredPanel, 'trustedProjects' | 'prefs'> {
    return { trustedProjects: this.trust.list, prefs: this.prefs }
  }

  /**
   * Меню MODEL: модели отвечающих подключений, которые умеют вызывать инструменты (или не
   * сказали): без инструментов агент не работает. Маленькое окно - пометкой в описании.
   */
  private menuModels(): ModelInfo[] {
    const models = this.models.list
      .filter((connection) => connection.state === 'ok')
      .flatMap((connection) =>
        connection.models
          .filter((model) => model.tools !== false)
          .map((model) => ({
            value: `${connection.id}/${model.id}`,
            displayName: model.name,
            description: connection.label,
            group: { id: connection.id, label: connection.label },
            // Уровни усилия - у рассуждающей модели; у прочих меню Effort пустое.
            efforts: model.reasoning ? REASONING_LEVELS : [],
            contextWindow: model.context ?? undefined,
            smallContext: model.context !== null && model.context < SMALL_CONTEXT_TOKENS,
          })),
      )

    // «По умолчанию» панели - первая модель: у неё и усилие по умолчанию.
    return models.map((model, index) => ({ ...model, isDefault: index === 0 }))
  }

  /** Свои папки OpenCode у IDE: конфиг, база разговоров (общая у всех процессов), кеш. */
  private dirs(): OpenCodeDirs {
    return {
      config: join(this.root, 'config'),
      data: join(this.root, 'data'),
      state: join(this.root, 'state'),
      cache: join(this.root, 'cache'),
    }
  }

  override shutdown(): Promise<void> {
    return super.shutdown(Promise.all([this.catalog.dispose(), this.proxy.stop()]))
  }

  /** Что прогонам сценариев и заданий нужно от панели открытых моделей (providers/opencode). */
  runHost(journalDir: string): OpenCodeRunHost {
    return {
      cli: () => locateOpenCodeCli(),
      dirs: () => this.dirs(),
      launch: (projectPath, directory, model, ideServers, servers) =>
        this.launchOn(
          model,
          onlyServers(this.connectors.configFor(projectPath, ideServers), servers),
          directory,
        ),
      models: () => this.menuModels(),
      messages: (sessionId, cursor) => this.catalog.messages(sessionId, cursor),
      dropBrief: (sessionId) => this.catalog.dropInstructions(sessionId, BRIEFING_KEY),
      journalDir,
    }
  }

  private defaultModel(): string | null {
    return this.menuModels()[0]?.value ?? null
  }

  /**
   * Запуск процесса OpenCode на модели (нет - «по умолчанию» панели): модель Ollama сначала
   * готовится, чтобы окно в конфиге было тем, с которым её держит сервер (ollama-window.ts),
   * а не её пределом; потом конфиг из подключений. По этому окну процесс в папке directory
   * получает полные или компактные указания (ADR 0089).
   */
  private async launchOn(
    model: string | null,
    connectors: GatewayLaunch | null,
    directory: string,
  ): Promise<OpenCodeLaunch> {
    const value = model || (this.defaultModel() ?? '')
    const ref = modelRefOf(value)

    if (ref) await this.models.prepare(ref.providerID, ref.id)

    return openCodeLaunch({
      connections: this.models.list,
      hasKey: (id) => this.models.keyOf(id) !== '',
      proxy: this.proxy,
      connectors,
      model: this.defaultModel(),
      directory,
      window: this.windowOf(value),
    })
  }

  /** Окно модели панели (`<подключение>/<модель>`); 0 - неизвестно. */
  private windowOf(model: string): number {
    return this.menuModels().find((option) => option.value === model)?.contextWindow ?? 0
  }

  protected readonly host: OpenCodeHost = {
    driver: openCodeDriver(() => this.host),
    cli: () => locateOpenCodeCli(),
    onFeedPatch: (patch) => this.events.onFeed(patch),
    dirs: () => this.dirs(),
    messages: (sessionId, cursor) => this.catalog.messages(sessionId, cursor),
    launch: (projectPath, model) =>
      this.launchOn(model, this.connectors.configFor(projectPath), projectPath),
    defaultModel: () => this.defaultModel(),
    contextWindow: (model) => this.windowOf(model),
    efforts: (model) => this.menuModels().find((option) => option.value === model)?.efforts ?? [],
    isTrusted: (projectPath) => this.trust.isTrusted(projectPath),
    onChange: () => this.persist.changed(),
    onCommands: (projectPath, commands) => this.commands.set(projectPath, commands),
    thumbnail: makeThumbnail,
    accountId: () => '',
    onCall: (conversationId, reason, key) => this.calls.add(conversationId, reason, key),
  }

  /** Своё OpenCode у панели: id сессии даёт сервер; история, имя и форк - процессом-каталогом. */
  protected readonly driver: PanelDriver = {
    newSessionId: () => '',
    hasJournal: (_projectPath, sessionId) => Promise.resolve(sessionId !== ''),
    // Сессия чужой папки - «журнала нет»: доверие и коннекторы проверены у этого проекта.
    journalName: async (projectPath, sessionId) => {
      const session = await this.catalog.session(sessionId)
      const title = typeof session?.['title'] === 'string' ? session['title'] : ''

      if (!session || !isSessionOf(session, projectPath)) return undefined

      return title ? { title, source: 'llm' } : null
    },
    listHistory: (projectPath, open) =>
      withoutRuns('opencode', projectPath, this.catalog.history(projectPath, open)),
    forkSession: (source, beforeMessageId) =>
      forkOpenCode(this.catalog, this.runtime(source.id), source, beforeMessageId),
    saveTitle: async (runtime, title) => {
      const live = openCodeOf(runtime).live
      const { sessionId } = runtime.meta

      if (!sessionId) return
      if (live) {
        await live.server.request('PATCH', `/api/session/${sessionId}`, { body: { title } })
      } else {
        await this.catalog.rename(sessionId, title)
      }
    },
    // Правки в папке проекта без вопросов, команды и сеть спрашивают - как «Авто» у Codex.
    defaultMode: () => Promise.resolve('acceptEdits'),
    newTabPrefs: () => Promise.resolve(this.prefs),
    feedLoaded: () => undefined,
    isTrusted: (projectPath) => this.trust.isTrusted(projectPath),
    trust: (projectPath) => this.trust.trust(projectPath),
    recheckCli: async () => {
      await this.refresh()

      return this.cliStatus === 'found'
    },
  }

  /** Своё OpenCode у действий над разговором: чего OpenCode не умеет, окно не показывает. */
  protected readonly ops: ConversationOps = {
    stopped: () => undefined,
    answerReopened: () => false,
    options: (_runtime, options) => options,
    sessionInfo: (runtime) => {
      const { feed } = openCodeOf(runtime)

      feed.builder.addNotice('session', runtime.meta.sessionId)
      feed.flush()
    },
    revertChanges: () => Promise.reject(new Error('Откат хода у OpenCode - откатом к сообщению')),
    stopTask: () => undefined,
    getImage: (runtime, messageId, index) =>
      Promise.resolve(openCodeOf(runtime).feed.images.get(messageId)?.[index] ?? null),
    previewRewind: (runtime, messageId) => previewOpenCodeRewind(runtime, messageId),
    rewind: (runtime, messageId, scope) => rewindOpenCode(runtime, messageId, scope),
  }
}
