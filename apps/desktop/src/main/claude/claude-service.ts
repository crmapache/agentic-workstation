import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import type { AgentPanelState } from '@shared/conversation'
import type { FeedPatch, FleetTranscript } from '@shared/conversation-feed'
import { CLAUDE_CAPABILITIES } from '@shared/panel-capabilities'
import type { ConversationCall } from '@shared/panel-prefs'

import type { JsonFile } from '../storage/json-file'
import { makeThumbnail } from '../agents/images/thumbnail'
import type { PanelDriver, PanelEvents } from '../agents/panel/agent-panel'
import { AgentPanel } from '../agents/panel/agent-panel'
import type { ConversationOps } from '../agents/panel/panel-actions'
import type { StoredPanel } from '../agents/panel/panel-state'
import { parseStoredClaude } from './claude-state'
import { ConnectorsBridge } from './connectors-bridge'
import { forkOriginFor } from './fork-origin'
import { AccountService } from './accounts/account-service'
import type { StoredAccounts } from './accounts/account-store'
import { CliAccess } from './cli/cli-access'
import type { CliProcess } from './cli/cli-process'
import { ComposerTools } from './composer/composer-tools'
import { claudeOf } from './conversation/claude-conversation'
import type { ClaudeHost } from './conversation/claude-conversation'
import { claudeDriver } from './conversation/claude-driver'
import { applyReplayFacts } from './conversation/replay-facts'
import { answerReopened } from './conversation/replay-facts'
import { rewind, previewRewind } from './conversation/rewind'
import { loadFleetTranscript } from './feed/fleet-files'
import { listHistory, transcriptName } from './history/transcript-files'
import { claudeHome, findTranscript } from './history/transcript-paths'
import { readTranscriptImage } from './images/transcript-images'
import { PanelDesk } from './panel/panel-desk'
import { defaultPermissionMode } from './settings/default-mode'
import { PanelSettings } from './settings/panel-settings'
import { WorkspaceTrust } from './settings/workspace-trust'
import { writeOwnTitle } from './tabs/tab-rename'
import { PluginTools } from './tools/plugin-tools'
import type { ToolsHost } from './tools/tools-host'
import { TodayTokens } from './usage/today-tokens'
import { UsageService } from './usage/usage-service'

export type ClaudeEvents = Pick<PanelEvents, 'hooks'> & {
  onState: (state: AgentPanelState) => void
  onFeed: (patch: FeedPatch) => void
  /** Открыть файл программой по умолчанию (скрипт входа в аккаунт - в Терминале). */
  openPath: (path: string) => Promise<string>
  /**
   * Разговор позвал человека - любым поводом, и выключенным в звуках: что из этого дойдёт до
   * окна (звук, свет вкладки), решают звуки IDE, телефону - все.
   */
  onCall: (call: ConversationCall) => void
}

/** Где на диске аккаунты Claude: реестр и папка их хранилищ входа. */
export type AccountPlaces = { file: JsonFile<StoredAccounts>; dir: string }

/**
 * Разговоры с Claude Code во всех проектах. Единственный владелец этого состояния
 * (ADR 0003, 0009): держит вкладки, пишет их на диск, рассылает окну состояние и
 * изменения лент. Вкладки привязаны к папке проекта, а не к id вкладки проекта: id
 * новый при каждом открытии, а разговоры должны вернуться вместе с папкой.
 */
export class ClaudeService extends AgentPanel {
  /** Служебное поверх разговоров: /btw, моды, модель, продолжения, переезд аккаунта (panel/). */
  readonly panel = new PanelDesk(this, (path) => this.events.openPath(path))
  /** Плагины и маркетплейсы. */
  readonly plugins = new PluginTools(this.toolsHost())
  /** Инструменты поля ввода: команды с диска, вложения. */
  readonly composer = new ComposerTools()
  /** Коннекторы IDE в процессах разговоров: файл серверов шлюза, перезапуск, переподключение. */
  readonly connectors = new ConnectorsBridge(() => this.runtimes.values())
  readonly cli = new CliAccess(
    () => this.scheduleBroadcast(),
    (cli) => ({ ...cli, env: this.accounts.envFor(cli.env) }),
  )
  /** Настройки панели и то, что за ними: источники слоёв, `/config` (settings/). */
  readonly settings = new PanelSettings(this.toolsHost(), () => this.persist.changed())
  /** Счётчик «tok» у поля: токены за сегодня по всем проектам машины. */
  readonly todayTokens = new TodayTokens(async () => join(await claudeHome(), 'projects'))
  private readonly trust: WorkspaceTrust

  private constructor(
    stored: StoredPanel,
    file: JsonFile<StoredPanel>,
    private readonly events: ClaudeEvents,
    readonly accounts: AccountService,
    readonly usage: UsageService,
  ) {
    super(stored, file, { onState: events.onState, onCall: events.onCall, hooks: events.hooks })
    this.settings.prefs = stored.prefs
    this.trust = new WorkspaceTrust(stored.trustedProjects, () => this.persist.changed())
    this.restore(stored)
  }

  static async load(
    file: JsonFile<StoredPanel>,
    events: ClaudeEvents,
    places: AccountPlaces,
  ): Promise<ClaudeService> {
    // Аккаунтам и расходу нужен сервис (CLI, рассылка, разговоры), сервису - они: связь
    // через замыкания.
    let service: ClaudeService | null = null
    const cli = () => service?.cli.locate() ?? Promise.resolve(null)
    const usage = new UsageService({
      cli,
      drawerOf: (id) => accounts.drawerFor(id),
      liveProcess: (id) => service?.liveProcess(id) ?? null,
      dir: places.dir,
      onChange: () => service?.scheduleBroadcast(),
    })
    const accounts = await AccountService.load(places.file, places.dir, {
      cli,
      openPath: events.openPath,
      onChange: () => service?.scheduleBroadcast(),
      onCurrentChanged: () => service?.panel.accountChanged(),
      onForgotten: (id) => void usage.forget(id),
    })

    const stored = parseStoredClaude(await file.read())

    service = new ClaudeService(stored, file, events, accounts, usage)
    void service.panel.start()

    return service
  }

  getState(): AgentPanelState {
    return {
      ...this.coreState(),
      builtinCommands: this.cli.commands,
      models: this.cli.models,
      cli: this.cli.status,
      accounts: { ...this.accounts.view, usage: this.usage.view, ...this.panel.accountFacts() },
      prefs: this.settings.prefs,
      refusedModes: this.panel.refusedModes,
      capabilities: CLAUDE_CAPABILITIES,
    }
  }

  /** Настройки панели: патч поверх текущих, негодное поле - отказ целиком. */
  setPrefs(patch: unknown): AgentPanelState {
    this.settings.apply(patch)

    return this.getState()
  }

  async signIn(accountId: string): Promise<AgentPanelState> {
    await this.accounts.signInAgain(accountId)

    return this.getState()
  }

  async cancelSignIn(): Promise<AgentPanelState> {
    await this.accounts.cancelSignIn()

    return this.getState()
  }

  async checkSignIn(): Promise<AgentPanelState> {
    await this.accounts.checkCurrent()

    return this.getState()
  }

  /**
   * Выход из обычного входа - и переход на соседний вошедший аккаунт, если он есть. Выйти
   * можно только из него: у добавленных аккаунтов вместо выхода - «забыть».
   */
  async signOut(accountId: string): Promise<AgentPanelState> {
    if (accountId === '') await this.panel.logout()

    return this.getState()
  }

  async addAccount(): Promise<AgentPanelState> {
    await this.accounts.add()

    return this.getState()
  }

  /** Выбор по уже текущему тоже переводит всё: вкладка могла отстать на старом входе. */
  selectAccount(accountId: string): Promise<AgentPanelState> {
    this.accounts.select(accountId)
    this.panel.accountChanged()

    return Promise.resolve(this.getState())
  }

  renameAccount(accountId: string, alias: string): Promise<AgentPanelState> {
    this.accounts.rename(accountId, alias)

    return Promise.resolve(this.getState())
  }

  async forgetAccount(accountId: string): Promise<AgentPanelState> {
    await this.accounts.forget(accountId)

    return this.getState()
  }

  async refreshUsage(accountIds: readonly string[]): Promise<AgentPanelState> {
    await this.usage.refresh(accountIds)

    return this.getState()
  }

  /** Выход из IDE: сверх общего - процессы аккаунтов (вход, вопросы расхода). */
  override shutdown(): Promise<void> {
    return super.shutdown(this.accounts.dispose())
  }

  protected storedExtras(): Pick<StoredPanel, 'trustedProjects' | 'prefs'> {
    return { trustedProjects: this.trust.list, prefs: this.settings.prefs }
  }

  /** Своё Claude у действий над разговором: транскрипт, копии файлов CLI, его управляющие запросы. */
  protected readonly ops: ConversationOps = {
    stopped: (conversationId) => this.panel.carryOn.cancel(conversationId),
    answerReopened: (runtime, requestId, response) => answerReopened(runtime, requestId, response),
    // Судьба выбора модели, быстрый режим без модели, которая его умеет, память аккаунта.
    options: (runtime, options) => this.panel.options(runtime, options),
    sessionInfo: (runtime) => {
      const { feed } = claudeOf(runtime)

      feed.builder.addNotice('session', runtime.meta.sessionId)
      feed.flush()
    },
    revertChanges: (runtime, turnId, path, restore) =>
      claudeOf(runtime).turnRevert.apply(turnId, path, restore),
    stopTask: (runtime, taskId) => {
      claudeOf(runtime)
        .process?.control({ subtype: 'stop_task', task_id: taskId })
        .catch((error: unknown) => console.warn('[claude] задача не остановилась:', taskId, error))
    },
    // Картинка - из транскрипта разговора, у нерождённого форка - из источника.
    getImage: async (runtime, messageId, index) => {
      const { projectPath, sessionId, fork } = runtime.meta
      const file =
        (await findTranscript(projectPath, sessionId)) ??
        (fork ? await findTranscript(projectPath, fork.sourceSessionId) : null)

      return file ? readTranscriptImage(file, messageId, index) : null
    },
    previewRewind: (runtime, messageId) => previewRewind(runtime, messageId),
    rewind: (runtime, messageId, scope) => rewind(runtime, messageId, scope),
  }

  /** Разговор агента флота с диска: в папке этого разговора, потом источника форка и прочих. */
  readFleetAgent(conversationId: string, agentId: string): Promise<FleetTranscript> {
    const { projectPath, sessionId, fork } = this.runtime(conversationId).meta
    const sessions = fork ? [sessionId, fork.sourceSessionId] : [sessionId]

    return loadFleetTranscript(projectPath, sessions, agentId)
  }

  /** Своё Claude у панели: транскрипты, форк по строке транскрипта, режим по настройкам CLI. */
  protected readonly driver: PanelDriver = {
    newSessionId: () => randomUUID(),
    hasJournal: async (projectPath, sessionId) =>
      (await findTranscript(projectPath, sessionId)) !== null,
    journalName: async (projectPath, sessionId) => {
      const file = await findTranscript(projectPath, sessionId)

      return file ? transcriptName(file) : undefined
    },
    listHistory: (projectPath, open) => listHistory(projectPath, open),
    forkSession: async (source, beforeMessageId) => ({
      sessionId: randomUUID(),
      origin: await forkOriginFor(source, beforeMessageId),
    }),
    saveTitle: (runtime, title) => writeOwnTitle(runtime, title),
    defaultMode: async (projectPath) => defaultPermissionMode(projectPath, await claudeHome()),
    // Закреплённый режим - если проект его допускает (bypass может быть запрещён).
    newTabPrefs: async (projectPath) => ({
      ...this.panel.newTabPrefs(this.settings.prefs),
      newTabMode: await this.settings.pinnedMode(projectPath),
    }),
    feedLoaded: (runtime) => applyReplayFacts(runtime),
    isTrusted: (projectPath) => this.trust.isTrusted(projectPath),
    trust: (projectPath) => this.trust.trust(projectPath),
    recheckCli: async () => (await this.cli.recheck()) !== null,
  }

  protected readonly host: ClaudeHost = {
    driver: claudeDriver(() => this.host),
    cli: async () => {
      const cli = await this.cli.locate()

      // Разговоры идут на выбранном аккаунте: его хранилище входа - в окружении CLI.
      return cli && { ...cli, env: this.accounts.envFor(cli.env) }
    },
    isTrusted: (projectPath) => this.trust.isTrusted(projectPath),
    onChange: () => this.persist.changed(),
    onFeedPatch: (patch) => this.events.onFeed(patch),
    onCommands: (projectPath, commands) => this.commands.set(projectPath, commands),
    onModels: (models) => this.cli.setModels(models),
    // Имена из init - без пояснений: их дают свои команды CLI и прошлый список проекта.
    knownCommands: (projectPath) => [...this.cli.commands, ...this.commands.of(projectPath)],
    thumbnail: makeThumbnail,
    accountId: () => this.accounts.current,
    onUsageHint: (runtime) => {
      const { process } = claudeOf(runtime)

      if (process?.isAlive) this.usage.fromProcess(runtime.accountId, process)
    },
    onCall: (conversationId, reason, key) => this.calls.add(conversationId, reason, key),
    mcpConfig: (projectPath) => this.connectors.configFor(projectPath),
    panel: this.panel,
  }

  /** Живой процесс разговора на аккаунте: расход у него свежий и бесплатный. */
  private liveProcess(accountId: string): CliProcess | null {
    const runtime = [...this.runtimes.values()].find(
      (item) => claudeOf(item).process?.isAlive && item.accountId === accountId,
    )

    return runtime ? claudeOf(runtime).process : null
  }

  /** Что нужно экранам плагинов и /config: CLI выбранного аккаунта, разговоры, доверие. */
  private toolsHost(): ToolsHost {
    return {
      runtime: (conversationId) => this.runtime(conversationId),
      runtimes: () => [...this.runtimes.values()],
      cli: () => this.host.cli(),
      isTrusted: (projectPath) => this.trust.isTrusted(projectPath),
      onCommands: (projectPath, commands) => this.host.onCommands(projectPath, commands),
    }
  }
}
