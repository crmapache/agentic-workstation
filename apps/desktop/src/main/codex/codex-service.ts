import { homedir } from 'node:os'

import type { CliStatus, ModelInfo, AgentPanelState } from '@shared/conversation'
import { CODEX_EFFORT_LEVELS } from '@shared/conversation'
import type { FeedPatch } from '@shared/conversation-feed'
import { CODEX_CAPABILITIES } from '@shared/panel-capabilities'
import type { PanelPrefs, ConversationCall } from '@shared/panel-prefs'

import { parseStoredClaude } from '../claude/claude-state'
import type { JsonFile } from '../storage/json-file'
import { makeThumbnail } from '../agents/images/thumbnail'
import type { PanelDriver } from '../agents/panel/agent-panel'
import { AgentPanel } from '../agents/panel/agent-panel'
import { FolderTrust } from '../agents/panel/folder-trust'
import type { ConversationOps } from '../agents/panel/panel-actions'
import type { StoredPanel } from '../agents/panel/panel-state'
import { applyPrefsPatch } from '../claude/settings/panel-prefs'
import type { CodexRunFacts } from '../providers/codex/codex-run-process'
import { withoutRuns } from '../providers/run-stream/run-history'
import { CodexConnectorsBridge } from './codex-connectors-bridge'
import { USAGE_MIN_MS, USAGE_NOTICE_MS } from './codex.constants'
import { CodexAccountDesk } from './account/codex-account-desk'
import type { CodexAccounts } from './account/codex-accounts'
import { CodexCatalog } from './catalog/codex-catalog'
import type { CodexCli } from './cli/codex-locator'
import { locateCodexCli } from './cli/codex-locator'
import { skillCommands, skillsFromList } from './conversation/codex-commands'
import type { UserServer } from './conversation/codex-connectors'
import { readUserServers } from './conversation/codex-connectors'
import type { CodexHost } from './conversation/codex-conversation'
import { codexOf } from './conversation/codex-conversation'
import { codexDriver } from './conversation/codex-driver'
import { forkSessionFor } from './conversation/codex-fork'
import { rewindCodex, previewCodexRewind } from './conversation/codex-rewind'

export type CodexEvents = {
  onState: (state: AgentPanelState) => void
  onFeed: (patch: FeedPatch) => void
  onCall: (call: ConversationCall) => void
  /** Открыть ссылку в браузере человека (вход через ChatGPT). */
  openUrl: (url: string) => boolean
}

/** Уровни и режимы, которые Codex принимает с диска и из окна. */
const CODEX_RULES = { efforts: CODEX_EFFORT_LEVELS, modes: CODEX_CAPABILITIES.modes }

/** Чего у Codex нет и что окну всё равно надо отдать пустым. */
const NO_REFUSALS = { bypass: false, autoModels: [] }

/**
 * Панель Codex (ADR 0083, docs/plan-providers/30-codex.md): разговоры Codex во всех проектах
 * на общем ядре панели. Своё - каталог (модели, кто вошёл, лимиты, история через процесс
 * app-server), доверие к папкам, состояние в `codex.json`.
 */
export class CodexService extends AgentPanel {
  readonly catalog: CodexCatalog
  /** Коннекторы IDE для процессов разговоров; шлюз ставит index.ts. */
  readonly connectors = new CodexConnectorsBridge(() => this.runtimes.values())
  private cliStatus: CliStatus = 'unknown'
  private models: ModelInfo[] = []
  private usageAskedAt = 0
  private prefs: PanelPrefs
  private readonly trust: FolderTrust
  private readonly desk: CodexAccountDesk
  private usageTimer: NodeJS.Timeout | null = null

  private constructor(
    stored: StoredPanel,
    file: JsonFile<StoredPanel>,
    private readonly events: CodexEvents,
    private readonly version: string,
    accounts: CodexAccounts,
  ) {
    super(stored, file, { onState: events.onState, onCall: events.onCall })
    this.prefs = stored.prefs
    this.trust = new FolderTrust(stored.trustedProjects, () => this.persist.changed())
    // Каталог аккаунта в работе: окружение входа берётся на каждом подъёме процесса.
    this.catalog = new CodexCatalog({
      cli: () => this.locate(),
      version,
      cwd: homedir(),
      onNotification: (method, params) => this.catalogNotice(method, params),
    })
    this.desk = new CodexAccountDesk(accounts, {
      catalog: this.catalog,
      catalogFor: (accountId, onNotice) => this.catalogOf(accountId, onNotice),
      openUrl: events.openUrl,
      changed: () => this.scheduleBroadcast(),
      accountChanged: () => this.afterAccountChange(),
      cliFound: () => this.cliStatus === 'found',
    })
    this.restore(stored)
  }

  static async load(
    file: JsonFile<StoredPanel>,
    events: CodexEvents,
    version: string,
    accounts: CodexAccounts,
  ): Promise<CodexService> {
    const stored = parseStoredClaude(await file.read(), { ...CODEX_RULES, sessionless: true })
    const service = new CodexService(stored, file, events, version, accounts)

    void service.refresh()

    return service
  }

  getState(): AgentPanelState {
    return {
      ...this.coreState(),
      builtinCommands: [],
      models: this.models,
      cli: this.cliStatus,
      accounts: this.desk.state(),
      prefs: this.prefs,
      refusedModes: NO_REFUSALS,
      capabilities: CODEX_CAPABILITIES,
    }
  }

  setPrefs(patch: unknown): AgentPanelState {
    this.prefs = applyPrefsPatch(this.prefs, patch, CODEX_RULES)
    this.persist.changed()

    return this.getState()
  }

  /** Лимиты аккаунтов: в работе - не чаще USAGE_MIN_MS, прочие - разовым каталогом каждого. */
  async refreshUsage(accountIds: readonly string[] = []): Promise<AgentPanelState> {
    const now = Date.now()
    const { current } = this.desk.accounts

    if (this.cliStatus === 'found' && now - this.usageAskedAt >= USAGE_MIN_MS) {
      this.usageAskedAt = now
      this.desk.setUsage(current, await this.catalog.usage())
    }

    if (this.cliStatus === 'found') await this.desk.refreshOthers(accountIds)

    return this.getState()
  }

  async signIn(accountId: string): Promise<AgentPanelState> {
    await this.desk.signIn(accountId)

    return this.getState()
  }

  async cancelSignIn(): Promise<AgentPanelState> {
    await this.desk.cancel()

    return this.getState()
  }

  async checkSignIn(): Promise<AgentPanelState> {
    this.desk.current = await this.catalog.account()

    return this.getState()
  }

  /** Выход из аккаунта строки: вход стирается у Codex (у обычного - и у терминального). */
  async signOut(accountId: string): Promise<AgentPanelState> {
    await this.desk.signOut(accountId)

    return this.getState()
  }

  async addAccount(): Promise<AgentPanelState> {
    await this.desk.add()

    return this.getState()
  }

  async selectAccount(accountId: string): Promise<AgentPanelState> {
    await this.desk.select(accountId)

    return this.getState()
  }

  renameAccount(accountId: string, alias: string): Promise<AgentPanelState> {
    this.desk.accounts.rename(accountId, alias)

    return Promise.resolve(this.getState())
  }

  async forgetAccount(accountId: string): Promise<AgentPanelState> {
    await this.desk.forget(accountId)

    return this.getState()
  }

  /**
   * Лимиты поменялись по ходу работы (`account/rateLimits/updated` - у процесса разговора или
   * каталога): спросить снимок заново, не чаще раза в пару секунд на пачку уведомлений.
   */
  usageChanged(): void {
    this.usageTimer ??= setTimeout(() => {
      this.usageTimer = null
      this.usageAskedAt = 0
      void this.refreshUsage().then(() => this.scheduleBroadcast())
    }, USAGE_NOTICE_MS)
  }

  /** Каталог заново: Codex на месте ли, модели, кто вошёл, лимиты. */
  async refresh(): Promise<void> {
    const cli = await this.locate()

    this.cliStatus = cli ? 'found' : 'missing'
    this.scheduleBroadcast()

    if (!cli) return

    const [models, account, usage] = await Promise.all([
      this.catalog.models(),
      this.catalog.account(),
      this.catalog.usage(),
    ])

    this.models = models
    this.desk.current = account
    this.desk.setUsage(this.desk.accounts.current, usage)
    this.usageAskedAt = Date.now()
    this.scheduleBroadcast()
  }

  override shutdown(): Promise<void> {
    if (this.usageTimer) clearTimeout(this.usageTimer)

    return super.shutdown(this.catalog.dispose())
  }

  /** Уведомления процесса-каталога: конец входа, смена входа, лимиты. */
  private catalogNotice(method: string, params: unknown): void {
    if (method === 'account/login/completed') this.desk.catalogNotice(method, params)
    else if (method === 'account/updated') void this.refresh()
    else if (method === 'account/rateLimits/updated') this.usageChanged()
  }

  /**
   * Аккаунт в работе сменился или вошёл заново: каталог - новым процессом на его входе, модели
   * и лимиты заново, разговоры - на нём, как освободятся.
   */
  private async afterAccountChange(): Promise<void> {
    this.catalog.reset()
    await this.refresh()

    for (const runtime of this.runtimes.values()) runtime.restartSession()
  }

  /** Каталог аккаунта: Codex с окружением его входа. */
  private catalogOf(
    accountId: string,
    onNotification: (method: string, params: unknown) => void,
  ): CodexCatalog {
    return new CodexCatalog({
      cli: () => this.locate(accountId),
      version: this.version,
      cwd: homedir(),
      onNotification,
    })
  }

  protected storedExtras(): Pick<StoredPanel, 'trustedProjects' | 'prefs'> {
    return { trustedProjects: this.trust.list, prefs: this.prefs }
  }

  /**
   * Свои MCP-серверы человека из конфига Codex (`codex mcp list --json`) - процессы IDE их
   * выключают. Спрашиваются при каждом запуске: человек мог добавить сервер в терминале.
   */
  private async userMcpServers(): Promise<readonly UserServer[]> {
    return (await readUserServers(await this.locate())) ?? []
  }

  /** Навыки проекта через каталог - командами «/»; сессия потом обновит их сама. */
  private async learnSkills(projectPath: string): Promise<void> {
    const skills = skillsFromList(await this.catalog.skills(projectPath))

    if (skills.length > 0) this.commands.set(projectPath, skillCommands(skills))
  }

  /** Что прогонам сценариев и заданий нужно от панели Codex (providers/codex). */
  get forRuns(): CodexRunFacts {
    return {
      cli: (accountId) => this.locate(accountId),
      gateway: (projectPath, ideServers) => this.connectors.configFor(projectPath, ideServers),
      userMcpServers: async () => readUserServers(await this.locate()),
      version: () => this.version,
      models: () => this.models,
      turns: (threadId, cursor) => this.catalog.turns(threadId, cursor),
      desk: this.desk,
    }
  }

  /** Codex на машине - с окружением входа аккаунта (по умолчанию - того, что в работе). */
  private async locate(accountId?: string): Promise<CodexCli | null> {
    const cli = await locateCodexCli()

    return (
      cli && {
        ...cli,
        env: await this.desk.accounts.envFor(accountId ?? this.desk.accounts.current, cli.env),
      }
    )
  }

  protected readonly host: CodexHost = {
    driver: codexDriver(() => this.host),
    cli: () => this.locate(),
    onFeedPatch: (patch) => this.events.onFeed(patch),
    version: () => this.version,
    model: (id) => this.models.find((model) => (id ? model.value === id : model.isDefault)) ?? null,
    turns: (threadId, cursor) => this.catalog.turns(threadId, cursor),
    onUsageChanged: () => this.usageChanged(),
    connectors: (projectPath) => this.connectors.configFor(projectPath),
    userMcpServers: () => this.userMcpServers(),
    isTrusted: (projectPath) => this.trust.isTrusted(projectPath),
    onChange: () => this.persist.changed(),
    onCommands: (projectPath, commands) => this.commands.set(projectPath, commands),
    thumbnail: makeThumbnail,
    accountId: () => this.desk.accounts.current,
    onCall: (conversationId, reason, key) => this.calls.add(conversationId, reason, key),
  }

  /** Своё Codex у панели: журналы - через каталог, id потока даёт сервер, форка пока нет. */
  protected readonly driver: PanelDriver = {
    newSessionId: () => '',
    hasJournal: (_projectPath, sessionId) => Promise.resolve(sessionId !== ''),
    journalName: async (projectPath, sessionId) => {
      const thread = await this.catalog.thread(sessionId)

      if (!thread || thread.cwd !== projectPath) return undefined

      return thread.title ? { title: thread.title, source: 'llm' } : null
    },
    listHistory: (projectPath, open) =>
      withoutRuns('codex', projectPath, this.catalog.history(projectPath, open)),
    forkSession: (source, beforeMessageId) =>
      forkSessionFor(this.runtime(source.id), source, beforeMessageId),
    saveTitle: async (runtime, title) => {
      const threadId = runtime.meta.sessionId
      const live = codexOf(runtime).live

      if (!threadId) return
      if (live) await live.server.request('thread/name/set', { threadId, name: title })
      else await this.catalog.rename(threadId, title)
    },
    // Как у самого Codex в доверенной папке: «Авто» - работа в папке проекта без вопросов.
    defaultMode: () => Promise.resolve('acceptEdits'),
    newTabPrefs: () => Promise.resolve(this.prefs),
    // Вкладку открыли: навыки проекта - в подсказку «/», не дожидаясь первого хода.
    feedLoaded: (runtime) => void this.learnSkills(runtime.meta.projectPath),
    isTrusted: (projectPath) => this.trust.isTrusted(projectPath),
    trust: (projectPath) => this.trust.trust(projectPath),
    recheckCli: async () => {
      await this.refresh()

      return this.cliStatus === 'found'
    },
  }

  /** Своё Codex у действий над разговором: чего Codex не умеет, окно не показывает. */
  protected readonly ops: ConversationOps = {
    stopped: () => undefined,
    answerReopened: () => false,
    options: (_runtime, options) => options,
    sessionInfo: (runtime) => {
      const { feed } = codexOf(runtime)

      feed.builder.addNotice('session', runtime.meta.sessionId)
      feed.flush()
    },
    revertChanges: () => Promise.reject(new Error('Откат файлов Codex - шаг 3.6')),
    stopTask: () => undefined,
    getImage: (runtime, messageId, index) =>
      Promise.resolve(codexOf(runtime).feed.images.get(messageId)?.[index] ?? null),
    previewRewind: (runtime, messageId) => previewCodexRewind(runtime, messageId),
    // Откат - сессией самого разговора (поднимется, если её нет): у потока один писатель.
    rewind: (runtime, messageId, scope) =>
      rewindCodex(runtime, messageId, scope, async (threadId, beforeTurnId) => {
        await runtime.prepareSession()

        const live = codexOf(runtime).live

        return live
          ? live.server.request('thread/revert', { threadId, beforeTurnId }).then(
              () => true,
              () => false,
            )
          : false
      }),
  }
}
