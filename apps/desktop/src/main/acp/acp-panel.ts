import { join } from 'node:path'

import type { AccountUsage } from '@shared/account-usage'
import type {
  CliNeed,
  CliStatus,
  ModelInfo,
  EffortLevel,
  AgentPanelState,
} from '@shared/conversation'
import type { FeedPatch } from '@shared/conversation-feed'
import type { PanelCapabilities } from '@shared/panel-capabilities'
import type { PanelPrefs, ConversationCall } from '@shared/panel-prefs'

import { parseStoredClaude } from '../claude/claude-state'
import { JsonFile } from '../storage/json-file'
import { withLocalTime } from '../agents/conversation/local-time-briefing'
import { makeThumbnail } from '../agents/images/thumbnail'
import type { PanelDriver, PanelEvents } from '../agents/panel/agent-panel'
import { AgentPanel } from '../agents/panel/agent-panel'
import type { ConversationOps } from '../agents/panel/panel-actions'
import type { StoredPanel } from '../agents/panel/panel-state'
import { applyPrefsPatch } from '../claude/settings/panel-prefs'
import type { AcpRunHost } from '../providers/acp/acp-run-host'
import { withoutRuns } from '../providers/run-stream/run-history'
import { AcpAccount } from './acp-account'
import type { StoredAcpAccount } from './acp-account'
import type { AcpCli, AcpAgent } from './acp-agent'
import { AcpConnectorsBridge } from './acp-connectors-bridge'
import { AcpUsage } from './acp-usage'
import { AcpCatalog } from './catalog/acp-catalog'
import type { AcpHost } from './conversation/acp-conversation'
import { acpOf } from './conversation/acp-conversation'
import { acpDriver } from './conversation/acp-driver'
import { forkAcpSession } from './conversation/acp-fork'
import { optionOf } from './conversation/acp-options'
import { rewindAcp, previewAcpRewind } from './conversation/acp-rewind'
import { withoutPromptTitles } from './conversation/acp-title'
import type { AcpConfigOption } from './protocol/acp-types'

export type AcpPanelEvents = Pick<PanelEvents, 'hooks'> & {
  onState: (state: AgentPanelState) => void
  onFeed: (patch: FeedPatch) => void
  onCall: (call: ConversationCall) => void
}

const NO_REFUSALS = { bypass: false, autoModels: [] }

export type AcpPanelOptions = {
  agent: AcpAgent
  capabilities: PanelCapabilities
  /** Папка панели в userData: в ней своя папка агента и пустая папка пробной сессии. */
  root: string
  version: string
  /** Кто вошёл - между запусками IDE (агент сам этого не говорит). */
  accountFile: JsonFile<StoredAcpAccount>
}

/**
 * Панель агента ACP (ADR 0083, 0092): разговоры Antigravity или Kimi Code во всех проектах на
 * общем ядре панели. Своё - описание агента (`AcpAgent`): CLI, своя папка, режимы, вход. Меню
 * моделей и уровней - из настроек сессии агента (`configOptions`): их приносит пробная сессия
 * каталога при старте и каждая живая сессия.
 */
export class AcpPanel extends AgentPanel {
  /** Коннекторы IDE для процессов разговоров; шлюз ставит index.ts. */
  readonly connectors = new AcpConnectorsBridge(() => this.runtimes.values())
  readonly catalog: AcpCatalog
  protected readonly host: AcpHost
  private cliStatus: CliStatus = 'unknown'
  /** Чего не хватает найденному CLI (Git Bash у Kimi на Windows) - экрану «не найден». */
  private cliNeed: CliNeed | null = null
  private prefs: PanelPrefs
  /** Настройки сессии агента: модели, уровни размышления, режимы. */
  private config: readonly AcpConfigOption[] = []
  readonly account: AcpAccount
  /** Лимиты подписки агента - кольцами под полем (у кого драйвер их знает). */
  private readonly usage: AcpUsage

  private constructor(
    stored: StoredPanel,
    file: JsonFile<StoredPanel>,
    private readonly events: AcpPanelEvents,
    private readonly options: AcpPanelOptions,
    account: StoredAcpAccount,
  ) {
    super(stored, file, { onState: events.onState, onCall: events.onCall, hooks: events.hooks })
    this.prefs = stored.prefs
    this.catalog = new AcpCatalog({
      agent: options.agent,
      cli: () => this.cli(),
      scratch: join(options.root, 'scratch'),
      version: options.version,
    })
    this.account = new AcpAccount(
      options.agent,
      () => this.cli(),
      this.catalog,
      account,
      () => {
        void options.accountFile.write(this.account.saved)
        this.scheduleBroadcast()
      },
      () => {
        void this.refresh()
        // Сообщения, вставшие в очередь из-за входа, уходят сами, как только вошли.
        for (const runtime of this.runtimes.values()) {
          if (!runtime.turnActive && runtime.meta.queue.length > 0) void runtime.outbox.release()
        }
      },
    )
    this.usage = new AcpUsage(
      options.agent,
      new JsonFile<AccountUsage | null>(join(options.root, 'usage.json')),
      () => this.scheduleBroadcast(),
    )
    // Описание агента нужно хозяину разговоров сразу: собирается после параметров конструктора.
    this.host = {
      agent: this.options.agent,
      driver: acpDriver(() => this.host),
      cli: () => this.cli(),
      onFeedPatch: (patch) => this.events.onFeed(patch),
      connectors: (projectPath) => this.connectors.serversFor(projectPath),
      replay: (sessionId, projectPath) => this.catalog.replay(sessionId, projectPath),
      onSetup: (setup) => {
        if (setup.configOptions) this.noteConfig(setup.configOptions)
        if (setup.sessionId) this.account.noteSetup(setup)
      },
      onSignedOut: () => this.account.noteSignedOut(),
      onAgentCommands: (projectPath, commands) => this.commands.set(projectPath, commands),
      // Пояс человека - заново на каждую сессию: смещение берётся на её начало.
      instructions: () => withLocalTime(this.options.agent.briefing),
      version: this.options.version,
      onChange: () => this.persist.changed(),
      onCommands: (projectPath, commands) => this.commands.set(projectPath, commands),
      thumbnail: makeThumbnail,
      accountId: () => '',
      onCall: (conversationId, reason, key) => {
        this.calls.add(conversationId, reason, key)
        // Ход кончился (сам или отказом): расход изменился, лимит мог кончиться на нём.
        if (reason === 'turnDone' || reason === 'error') this.usage.afterTurn()
      },
    }
    this.restore(stored)
  }

  static async load(
    file: JsonFile<StoredPanel>,
    events: AcpPanelEvents,
    options: AcpPanelOptions,
  ): Promise<AcpPanel> {
    const rules = AcpPanel.rulesOf(options.capabilities)
    const parsed = parseStoredClaude(await file.read(), { ...rules, sessionless: true })
    const stored = options.agent.title ? withoutPromptTitles(parsed) : parsed

    // Без указаний агент всё равно работает: сбой записи - в журнал, а не отказ панели.
    await options.agent.prepare?.().catch((error: unknown) => {
      console.warn(`[${options.agent.tag}] указания IDE не записаны:`, error)
    })
    const saved = await options.accountFile.read()
    const email =
      typeof saved === 'object' &&
      saved !== null &&
      typeof (saved as StoredAcpAccount).email === 'string'
        ? (saved as StoredAcpAccount).email
        : ''
    const panel = new AcpPanel(stored, file, events, options, { email })

    void panel.refresh()

    return panel
  }

  /** Уровни и режимы, которые панель принимает с диска и из окна. */
  private static rulesOf(capabilities: PanelCapabilities) {
    return { efforts: capabilities.efforts, modes: capabilities.modes }
  }

  get agent(): AcpAgent {
    return this.options.agent
  }

  getState(): AgentPanelState {
    return {
      ...this.coreState(),
      builtinCommands: [],
      models: this.menuModels(),
      cli: this.cliStatus,
      ...(this.cliNeed ? { cliNeed: this.cliNeed } : {}),
      accounts: { ...this.account.state(), usage: this.usage.view() },
      prefs: this.prefs,
      refusedModes: NO_REFUSALS,
      capabilities: this.options.capabilities,
    }
  }

  setPrefs(patch: unknown): AgentPanelState {
    this.prefs = applyPrefsPatch(this.prefs, patch, AcpPanel.rulesOf(this.options.capabilities))
    this.persist.changed()

    return this.getState()
  }

  async refreshUsage(): Promise<AgentPanelState> {
    await this.usage.refresh()

    return this.getState()
  }

  // Вход у агента ACP один (accounts: 'acp'): войти, отменить, проверить, выйти и код со страницы.
  signIn = async (): Promise<AgentPanelState> => {
    await this.account.signIn()

    return this.getState()
  }

  cancelSignIn = (): Promise<AgentPanelState> => {
    this.account.cancel()

    return Promise.resolve(this.getState())
  }

  checkSignIn = async (): Promise<AgentPanelState> => {
    await this.account.check()

    return this.getState()
  }

  signOut = async (): Promise<AgentPanelState> => {
    await this.account.signOut()
    if (this.account.isSignedOut) this.usage.forget()

    return this.getState()
  }

  override submitSignInCode(code: string): Promise<AgentPanelState> {
    this.account.submitCode(code)

    return Promise.resolve(this.getState())
  }

  // Несколько аккаунтов у агента ACP не бывает (ADR 0092): окно этих действий не показывает.
  addAccount = (): Promise<AgentPanelState> => Promise.resolve(this.getState())
  selectAccount = (): Promise<AgentPanelState> => Promise.resolve(this.getState())
  renameAccount = (): Promise<AgentPanelState> => Promise.resolve(this.getState())
  forgetAccount = (): Promise<AgentPanelState> => Promise.resolve(this.getState())

  /**
   * CLI агента на месте ли; нашёлся - пробная сессия: меню моделей и вошёл ли (без входа
   * агент отказывает уже на `session/new`).
   */
  async refresh(): Promise<void> {
    const cli = await this.cli()

    this.cliNeed = cli ? null : ((await this.options.agent.needs?.()) ?? null)
    this.cliStatus = cli ? 'found' : 'missing'
    this.scheduleBroadcast()

    if (!cli) return

    const probe = await this.catalog.probe()

    if (probe.signedOut) this.account.noteSignedOut()
    if (probe.setup) {
      if (probe.setup.configOptions) this.noteConfig(probe.setup.configOptions)
      this.account.noteSetup(probe.setup)
    }
  }

  /**
   * Что прогонам без вкладки (сценарии, задания, коннектор от ИИ) нужно от панели: агент, его
   * CLI, коннекторы IDE процессу прогона и отказ без входа - кнопке входа панели (ADR 0085).
   */
  runHost(journalDir: string, label: string): AcpRunHost {
    return {
      agent: this.options.agent,
      label,
      cli: () => this.cli(),
      connectors: (projectPath, ideServers, only) =>
        this.connectors.serversFor(projectPath, ideServers, only),
      signedOut: () => this.account.noteSignedOut(),
      version: this.options.version,
      journalDir,
    }
  }

  override shutdown(): Promise<void> {
    this.account.dispose()

    return super.shutdown(this.catalog.dispose())
  }

  protected storedExtras(): Pick<StoredPanel, 'prefs'> {
    return { prefs: this.prefs }
  }

  private cli(): Promise<AcpCli | null> {
    return this.options.agent.locate()
  }

  /** Настройки сессии от агента - меню панели; рассылка, только если меню правда другое. */
  private noteConfig(options: readonly AcpConfigOption[]): void {
    const before = JSON.stringify(this.menuModels())

    this.config = options

    if (JSON.stringify(this.menuModels()) !== before) this.scheduleBroadcast()
  }

  /**
   * Меню MODEL: варианты настройки модели агента в порядке меню драйвера (`lineup`), иначе в
   * порядке агента; уровни усилия - варианты настройки размышления (общие у всех моделей
   * агента); «по умолчанию» - текущая модель агента.
   */
  private menuModels(): ModelInfo[] {
    const model = optionOf(this.config, 'model')
    const thought = optionOf(this.config, 'thought_level')
    const efforts: EffortLevel[] = thought ? this.options.agent.effortsOf(thought) : []
    const models = (model?.options ?? []).map((option) => ({
      value: option.value,
      displayName: option.name,
      description: option.description ?? '',
      efforts,
      isDefault: option.value === model?.currentValue,
    }))

    return this.options.agent.lineup?.(models) ?? models
  }

  /** Своё ACP у панели: id сессии даёт агент; история и повтор - процессом-каталогом. */
  protected readonly driver: PanelDriver = {
    newSessionId: () => '',
    hasJournal: (_projectPath, sessionId) => Promise.resolve(sessionId !== ''),
    journalName: async (projectPath, sessionId) => {
      const entry = await this.catalog.find(projectPath, sessionId)

      if (!entry) return undefined

      return entry.title ? { title: entry.title, source: 'llm' } : null
    },
    listHistory: (projectPath, open) =>
      withoutRuns(
        this.options.agent.provider,
        projectPath,
        this.catalog.history(projectPath, open),
      ),
    // Форк - только целиком и только у агента, который его объявил (acp-fork.ts).
    forkSession: (source, beforeMessageId) =>
      forkAcpSession(this.runtime(source.id), source, beforeMessageId, (sessionId, projectPath) =>
        this.catalog.fork(sessionId, projectPath),
      ),
    // Переименовать разговор у агента ACP нечем: имя живёт во вкладке IDE.
    saveTitle: () => Promise.resolve(),
    defaultMode: () => Promise.resolve('default'),
    newTabPrefs: () => Promise.resolve(this.prefs),
    feedLoaded: () => undefined,
    recheckCli: async () => {
      await this.refresh()

      return this.cliStatus === 'found'
    },
  }

  /** Своё ACP у действий над разговором: чего агент не умеет, окно не показывает. */
  protected readonly ops: ConversationOps = {
    stopped: () => undefined,
    answerReopened: () => false,
    options: (_runtime, options) => options,
    sessionInfo: (runtime) => {
      const { feed } = acpOf(runtime)

      feed.builder.addNotice('session', runtime.meta.sessionId)
      feed.flush()
    },
    revertChanges: () => Promise.reject(new Error('ACP: отката хода нет')),
    stopTask: () => undefined,
    getImage: (runtime, messageId, index) =>
      Promise.resolve(acpOf(runtime).feed.images.get(messageId)?.[index] ?? null),
    // Откат - только кода, обратными правками по диффам ленты (acp-rewind.ts).
    previewRewind: (runtime, messageId) => previewAcpRewind(runtime, messageId),
    rewind: (runtime, messageId, scope) => rewindAcp(runtime, messageId, scope),
  }
}
