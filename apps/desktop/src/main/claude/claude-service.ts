import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import type {
  ForkOrigin,
  ClaudeState,
  Conversation,
  HistoryEntry,
  ConversationOptions,
} from '@shared/claude'
import type { FeedPatch, ConversationFeed } from '@shared/claude-feed'
import type { ConversationCall } from '@shared/claude-prefs'

import type { JsonFile } from '../storage/json-file'
import { ClaudePersistence } from './claude-persistence'
import type { StoredClaude } from './claude-state'
import { toStored, freshConversation, parseStoredClaude } from './claude-state'
import { SHUTDOWN_MAX_MS } from './claude.constants'
import { ConnectorsBridge } from './connectors-bridge'
import { ConversationActions } from './conversation-actions'
import { forkOriginFor } from './fork-origin'
import { AccountService } from './accounts/account-service'
import type { StoredAccounts } from './accounts/account-store'
import { ConversationCalls } from './calls/conversation-calls'
import { CliAccess } from './cli/cli-access'
import type { CliProcess } from './cli/cli-process'
import { ProcessGroup } from './cli/process-group'
import { ProjectCommands } from './cli/project-commands'
import { ComposerTools } from './composer/composer-tools'
import type { ConversationHost } from './conversation/conversation-runtime'
import { ConversationRuntime } from './conversation/conversation-runtime'
import { applyReplayFacts } from './conversation/replay-facts'
import { listHistory, transcriptName } from './history/transcript-files'
import { claudeHome, findTranscript } from './history/transcript-paths'
import type { TranscriptSummary } from './history/transcript-summary'
import { makeThumbnail } from './images/thumbnail'
import { PanelDesk } from './panel/panel-desk'
import { PanelSettings } from './settings/panel-settings'
import { WorkspaceTrust } from './settings/workspace-trust'
import { newTabConversation } from './tabs/new-tab'
import { TabStrip } from './tabs/tab-strip'
import { PluginTools } from './tools/plugin-tools'
import type { ToolsHost } from './tools/tools-host'
import { TodayTokens } from './usage/today-tokens'
import { UsageService } from './usage/usage-service'

export type ClaudeEvents = {
  onState: (state: ClaudeState) => void
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
export class ClaudeService {
  /** Действия над одним разговором - отдельно: здесь держатся сами разговоры. */
  readonly actions = new ConversationActions(this)
  /** Служебное поверх разговоров: /btw, моды, модель, продолжения, переезд аккаунта (panel/). */
  readonly panel = new PanelDesk(this, (path) => this.events.openPath(path))
  /** Плагины и маркетплейсы. */
  readonly plugins = new PluginTools(this.toolsHost())
  /** Инструменты поля ввода: команды с диска, вложения. */
  readonly composer = new ComposerTools()
  /** Коннекторы IDE в процессах разговоров: файл серверов шлюза, перезапуск, переподключение. */
  readonly connectors = new ConnectorsBridge(() => this.runtimes.values())
  /** Полоса вкладок: порядок, группы форков, имена, закрытые - отдельно (tabs/). */
  readonly tabs = new TabStrip({
    runtimes: () => this.runtimes,
    activeByProject: () => this.activeByProject,
    setActive: (projectPath, id) => this.setActive(projectPath, id),
    spawn: (conversation) => new ConversationRuntime(conversation, this.host),
    changed: () => this.persist.changed(),
    state: () => this.getState(),
  })
  private readonly runtimes = new Map<string, ConversationRuntime>()
  private readonly commands: ProjectCommands
  readonly cli = new CliAccess(
    () => this.scheduleBroadcast(),
    (cli) => ({ ...cli, env: this.accounts.envFor(cli.env) }),
  )
  /** Настройки панели и то, что за ними: источники слоёв, `/config` (settings/). */
  readonly settings = new PanelSettings(this.toolsHost(), () => this.persist.changed())
  /** Счётчик «tok» у поля: токены за сегодня по всем проектам машины. */
  readonly todayTokens = new TodayTokens(async () => join(await claudeHome(), 'projects'))
  /** Поводы позвать человека: звук, свечение вкладки, телефон (calls/). */
  private readonly calls = new ConversationCalls((call) => this.events.onCall(call))
  private readonly trust: WorkspaceTrust
  private activeByProject: Record<string, string>
  private readonly persist: ClaudePersistence

  private constructor(
    stored: StoredClaude,
    file: JsonFile<StoredClaude>,
    private readonly events: ClaudeEvents,
    readonly accounts: AccountService,
    readonly usage: UsageService,
  ) {
    this.persist = new ClaudePersistence(
      file,
      () => this.stored(),
      () => events.onState(this.getState()),
    )
    this.activeByProject = stored.activeByProject
    this.commands = new ProjectCommands(stored.commandsByProject, (saved) =>
      saved ? this.persist.changed() : this.scheduleBroadcast(),
    )
    this.settings.prefs = stored.prefs
    this.trust = new WorkspaceTrust(stored.trustedProjects, () => this.persist.changed())

    for (const conversation of stored.conversations) {
      this.runtimes.set(
        conversation.id,
        new ConversationRuntime(freshConversation(conversation), this.host),
      )
    }

    this.tabs.restore(stored.closed)
  }

  static async load(
    file: JsonFile<StoredClaude>,
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

  getState(): ClaudeState {
    return {
      conversations: [...this.runtimes.values()].map((runtime) => runtime.meta),
      activeByProject: this.activeByProject,
      closedByProject: this.tabs.closedByProject(),
      commandsByProject: this.commands.view,
      builtinCommands: this.cli.commands,
      models: this.cli.models,
      cli: this.cli.status,
      accounts: { ...this.accounts.view, usage: this.usage.view, ...this.panel.accountFacts() },
      prefs: this.settings.prefs,
      refusedModes: this.panel.refusedModes,
    }
  }

  /** Настройки панели: патч поверх текущих, негодное поле - отказ целиком. */
  setPrefs(patch: unknown): ClaudeState {
    this.settings.apply(patch)

    return this.getState()
  }

  /** Лента разговора; прочитанный транскрипт отдаёт вкладке модель и оборванный вопрос. */
  async getFeed(conversationId: string): Promise<ConversationFeed> {
    const runtime = this.runtime(conversationId)
    const feed = await runtime.getFeed()

    applyReplayFacts(runtime)

    return feed
  }

  /**
   * Новая вкладка. Модель, усилие и режим - закреплённые в Settings → New chats, иначе
   * как у выбранной вкладки проекта.
   */
  async newConversation(projectPath: string): Promise<ClaudeState> {
    await this.addRuntime(projectPath, randomUUID(), null)

    return this.getState()
  }

  /**
   * Новая вкладка с выбором сразу (Remote Control): модель, усилие и режим ставятся до того,
   * как поднимется процесс. Ответ - id созданной вкладки, а не состояние, в котором её надо
   * искать.
   */
  async openConversation(projectPath: string, options: ConversationOptions): Promise<string> {
    const id = await this.addRuntime(projectPath, randomUUID(), null)

    this.actions.setOptions(id, options)

    return id
  }

  activateConversation(conversationId: string): ClaudeState {
    this.setActive(this.runtime(conversationId).meta.projectPath, conversationId)

    return this.getState()
  }

  /** Выбрать вкладку проекта; null - вкладок не осталось. */
  private setActive(projectPath: string, conversationId: string | null) {
    const { [projectPath]: _previous, ...rest } = this.activeByProject

    this.activeByProject = conversationId ? { ...rest, [projectPath]: conversationId } : rest
    this.persist.changed()
  }

  /** Доверена ли папка: процесс CLI для недоверенной не поднимается ни в каком обходе. */
  isTrusted(projectPath: string): Promise<boolean> {
    return this.trust.isTrusted(projectPath)
  }

  /** Человек доверился папке: разговоры, которые на этом стояли, отправляют ждавшее. */
  async trustProject(projectPath: string): Promise<ClaudeState> {
    this.trust.trust(projectPath)
    await Promise.all(
      [...this.runtimes.values()]
        .filter((runtime) => runtime.meta.projectPath === projectPath)
        .map((runtime) => runtime.resolveError('untrusted')),
    )

    return this.getState()
  }

  listHistory(projectPath: string): Promise<HistoryEntry[]> {
    const open = new Set(
      [...this.runtimes.values()]
        .filter((runtime) => runtime.meta.projectPath === projectPath)
        .map((runtime) => runtime.meta.sessionId),
    )

    return listHistory(projectPath, open)
  }

  /**
   * Открыть прошлый разговор. Уже открыт - выбрать его вкладку: два процесса на одном
   * транскрипте писали бы в него наперегонки. Транскрипта нет - отказ: с чужим id
   * вкладка начала бы новую сессию под id, который выбрало окно. Заголовок берётся из
   * транскрипта, а не из запроса.
   */
  async openHistory(projectPath: string, sessionId: string): Promise<ClaudeState> {
    const open = [...this.runtimes.values()].find(
      (runtime) => runtime.meta.projectPath === projectPath && runtime.meta.sessionId === sessionId,
    )

    if (open) return this.activateConversation(open.meta.id)

    const file = await findTranscript(projectPath, sessionId)

    if (!file) throw new Error(`Транскрипта ${sessionId} нет`)

    await this.addRuntime(projectPath, sessionId, await transcriptName(file))

    return this.getState()
  }

  /** Форк в новой вкладке рядом: тот же разговор до точки, дальше - своя ветка. */
  async fork(conversationId: string, beforeMessageId: string | null): Promise<ClaudeState> {
    const source = this.runtime(conversationId).meta
    const origin = await forkOriginFor(source, beforeMessageId)

    await this.addRuntime(source.projectPath, randomUUID(), null, source, origin)

    return this.getState()
  }

  /** Поискать CLI заново: человек поставил его, пока IDE была открыта. */
  async recheckCli(): Promise<ClaudeState> {
    const cli = await this.cli.recheck()

    if (cli) {
      await Promise.all(
        [...this.runtimes.values()].map((runtime) => runtime.resolveError('cli-not-found')),
      )
    }

    return this.getState()
  }

  /**
   * Выход из IDE: процессы CLI, команды «!» и разовые команды CLI гасятся с ожиданием,
   * а вкладки дописываются на диск. Без ожидания таймер добивания не успел бы
   * сработать, и упрямый CLI пережил бы IDE вместе со своими MCP-серверами.
   */
  async shutdown(): Promise<void> {
    const stopped = Promise.all([
      ...[...this.runtimes.values()].map((runtime) => runtime.dispose()),
      this.accounts.dispose(),
      ProcessGroup.stopAll(),
    ])

    await Promise.race([stopped, delay(SHUTDOWN_MAX_MS)])
    await this.persist.save()
  }

  private readonly host: ConversationHost = {
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
      if (runtime.process?.isAlive) this.usage.fromProcess(runtime.accountId, runtime.process)
    },
    onCall: (conversationId, reason, key) => this.calls.add(conversationId, reason, key),
    mcpConfig: (projectPath) => this.connectors.configFor(projectPath),
    panel: this.panel,
  }

  /** Живой процесс разговора на аккаунте: расход у него свежий и бесплатный. */
  private liveProcess(accountId: string): CliProcess | null {
    const runtime = [...this.runtimes.values()].find(
      (item) => item.process?.isAlive && item.accountId === accountId,
    )

    return runtime?.process ?? null
  }

  /**
   * Вкладка разговора, выбранная в своём проекте. Модель, усилие и режим - как у base
   * (форк продолжает свой источник и встаёт в его группу), иначе как у выбранной до неё
   * или закреплённые в Settings (tabs/new-tab.ts).
   */
  private async addRuntime(
    projectPath: string,
    sessionId: string,
    name: TranscriptSummary,
    base?: Conversation,
    fork: ForkOrigin | null = null,
  ) {
    const current = this.runtimes.get(this.activeByProject[projectPath] ?? '')?.meta
    // Закреплённый режим - если проект его допускает (bypass может быть запрещён).
    const pinnedMode = await this.settings.pinnedMode(projectPath)
    const prefs = { ...this.panel.newTabPrefs(this.settings.prefs), newTabMode: pinnedMode }
    const tab = { projectPath, sessionId, name, base, fork, current, prefs }
    const conversation = await newTabConversation(tab)

    this.tabs.add(conversation)

    return conversation.id
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

  /** Разговор по id из окна; нет такого - ошибка, а не тихий пропуск. */
  runtime(conversationId: string): ConversationRuntime {
    const runtime = this.runtimes.get(conversationId)

    if (!runtime) throw new Error(`Разговора ${conversationId} нет`)

    return runtime
  }

  scheduleBroadcast() {
    this.persist.scheduleBroadcast()
  }

  /** Что о вкладках хранится на диске. */
  private stored(): StoredClaude {
    return {
      conversations: [...this.runtimes.values()].map((runtime) => toStored(runtime.meta)),
      closed: this.tabs.stored(),
      activeByProject: this.activeByProject,
      trustedProjects: this.trust.list,
      prefs: this.settings.prefs,
      commandsByProject: this.commands.stored(),
    }
  }
}
