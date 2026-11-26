import { setTimeout as delay } from 'node:timers/promises'

import type {
  ForkOrigin,
  Conversation,
  HistoryEntry,
  PermissionMode,
  AgentPanelState,
  ConversationOptions,
} from '@shared/conversation'
import type { ConversationFeed } from '@shared/conversation-feed'
import type { PanelPrefs, ConversationCall } from '@shared/panel-prefs'

import { ConversationCalls } from '../calls/conversation-calls'
import type { AgentHost } from '../conversation/agent-parts'
import { ConversationRuntime } from '../conversation/conversation-runtime'
import type { PanelHooks } from '../hooks/conversation-hooks'
import { ProcessGroup } from '../../process/process-group'
import { forgetLoginShellEnv } from '../../process/shell-env'
import type { JsonFile } from '../../storage/json-file'
import type { HistoryName } from './new-tab'
import { newTabConversation } from './new-tab'
import type { ConversationOps } from './panel-actions'
import { PanelActions } from './panel-actions'
import { PanelPersistence } from './panel-persistence'
import type { StoredPanel } from './panel-state'
import { toStored, freshConversation } from './panel-state'
import { SHUTDOWN_MAX_MS } from './panel.constants'
import { ProjectCommands } from './project-commands'
import { TabStrip } from './tab-strip'

/**
 * Своё провайдера у панели (ADR 0083): журналы разговоров, форк, умолчания новой вкладки,
 * поиск CLI. Разговор внутри - через AgentDriver (agent-parts.ts).
 */
export type PanelDriver = {
  /**
   * id сессии новой вкладки. У Claude его выбираем мы (имя транскрипта, `--session-id`), у
   * Codex id потока даёт сервер - до первого хода он пустой.
   */
  newSessionId: () => string
  /** Журнал разговора на диске у провайдера (у Claude - транскрипт). */
  hasJournal: (projectPath: string, sessionId: string) => Promise<boolean>
  /** Имя прошлого разговора из журнала; undefined - журнала нет. */
  journalName: (projectPath: string, sessionId: string) => Promise<HistoryName | undefined>
  /** Прошлые разговоры проекта; open - id сессий, которые сейчас открыты вкладками. */
  listHistory: (projectPath: string, open: ReadonlySet<string>) => Promise<HistoryEntry[]>
  /**
   * Сессия вкладки-форка и откуда она ответвлена: до сообщения (beforeMessageId null -
   * разговор целиком). origin null - форку не от чего идти: вкладка начнёт новый разговор.
   * Claude выбирает id сам и режет при первом сообщении; Codex создаёт ветку потока сразу.
   */
  forkSession: (
    source: Conversation,
    beforeMessageId: string | null,
  ) => Promise<{ sessionId: string; origin: ForkOrigin | null }>
  /** Имя от человека - провайдеру: живой сессии словами её CLI, иначе в журнал. */
  saveTitle: (runtime: ConversationRuntime, title: string) => Promise<void>
  /** Режим новой вкладки, когда его не дали ни закреплённые настройки, ни соседняя вкладка. */
  defaultMode: (projectPath: string) => Promise<PermissionMode>
  /** Закреплённое для новых вкладок (Settings → New chats) с поправкой на проект и аккаунт. */
  newTabPrefs: (projectPath: string) => Promise<PanelPrefs>
  /** Лента прочитана из журнала: то, что журнал знает о вкладке (модель, оборванный вопрос). */
  feedLoaded: (runtime: ConversationRuntime) => void
  /** Поискать CLI заново: человек поставил его, пока IDE была открыта. true - нашёлся. */
  recheckCli: () => Promise<boolean>
}

/** Куда панель сообщает: состояние окну, зов человека. */
export type PanelEvents = {
  onState: (state: AgentPanelState) => void
  onCall: (call: ConversationCall) => void
  /** Хуки расширений IDE (ADR 0091): отправка, вопрос разрешения, конец хода. */
  hooks?: PanelHooks | undefined
}

/**
 * Панель провайдера (ADR 0083): разговоры во всех проектах по вкладке на разговор.
 * Единственный владелец этого состояния (ADR 0003): держит вкладки, пишет их на диск,
 * рассылает окну. Вкладки привязаны к папке проекта, а не к id вкладки проекта: id новый
 * при каждом открытии, а разговоры должны вернуться вместе с папкой. Своё провайдера -
 * у наследника: хост разговоров, драйвер панели, состояние окну сверх общего.
 */
export abstract class AgentPanel {
  /** Полоса вкладок: порядок, группы форков, имена, закрытые. */
  readonly tabs: TabStrip
  /** Действия над одним разговором - отдельно: здесь держатся сами разговоры. */
  readonly actions: PanelActions
  protected readonly runtimes = new Map<string, ConversationRuntime>()
  protected readonly commands: ProjectCommands
  /** Поводы позвать человека: звук, свечение вкладки, телефон. */
  protected readonly calls: ConversationCalls
  protected readonly persist: PanelPersistence
  protected activeByProject: Record<string, string>

  /** Хост разговоров: рассылка, зов, драйвер разговора провайдера. */
  protected abstract readonly host: AgentHost
  private readonly hooks: PanelHooks | undefined
  protected abstract readonly driver: PanelDriver
  /** Своё провайдера у действий над разговором: откат, картинки, задачи, поправка выбора. */
  protected abstract readonly ops: ConversationOps

  protected constructor(stored: StoredPanel, file: JsonFile<StoredPanel>, events: PanelEvents) {
    this.hooks = events.hooks
    this.persist = new PanelPersistence(
      file,
      () => this.stored(),
      () => events.onState(this.getState()),
    )
    this.activeByProject = stored.activeByProject
    this.commands = new ProjectCommands(stored.commandsByProject, (saved) =>
      saved ? this.persist.changed() : this.scheduleBroadcast(),
    )
    this.calls = new ConversationCalls(events.onCall)
    this.actions = new PanelActions(this, () => this.ops)
    this.tabs = new TabStrip({
      runtimes: () => this.runtimes,
      activeByProject: () => this.activeByProject,
      setActive: (projectPath, id) => this.setActive(projectPath, id),
      spawn: (conversation) => new ConversationRuntime(conversation, this.host, this.hooks),
      changed: () => this.persist.changed(),
      state: () => this.getState(),
      hasJournal: (tab) => this.driver.hasJournal(tab.projectPath, tab.sessionId),
      saveTitle: (runtime, title) => this.driver.saveTitle(runtime, title),
    })
  }

  /** Состояние для окна: общее (coreState) и своё провайдера. */
  abstract getState(): AgentPanelState

  /** Настройки панели (Settings): патч поверх текущих, негодное поле - отказ целиком. */
  abstract setPrefs(patch: unknown): AgentPanelState

  /** Освежить лимиты аккаунтов панели (кольца под полем); чаще своего шага не спрашивает. */
  abstract refreshUsage(accountIds: readonly string[]): Promise<AgentPanelState>

  /**
   * Вход аккаунта провайдера (экран входа вместо панели): Claude - в Терминале, в хранилище
   * этого аккаунта; Codex - в браузере через сам Codex. Ответ - сразу, вход ждётся дальше.
   */
  abstract signIn(accountId: string): Promise<AgentPanelState>
  abstract cancelSignIn(): Promise<AgentPanelState>
  /** Спросить заново, вошёл ли аккаунт в работе: человек мог войти мимо панели. */
  abstract checkSignIn(): Promise<AgentPanelState>
  abstract signOut(accountId: string): Promise<AgentPanelState>
  /** Аккаунты провайдера: новый (сразу со входом), выбор для всех разговоров, имя, забыть. */
  abstract addAccount(): Promise<AgentPanelState>
  abstract selectAccount(accountId: string): Promise<AgentPanelState>
  abstract renameAccount(accountId: string, alias: string): Promise<AgentPanelState>
  abstract forgetAccount(accountId: string): Promise<AgentPanelState>

  /**
   * Код со страницы входа (вход агента ACP `agy`, ADR 0092). У кого вход идёт без кода, этот
   * канал не зовут: окно поле не показывает.
   */
  submitSignInCode(_code: string): Promise<AgentPanelState> {
    return Promise.resolve(this.getState())
  }

  /** Что о панели хранится на диске сверх вкладок: настройки. */
  protected abstract storedExtras(): Pick<StoredPanel, 'prefs'>

  /**
   * Вкладки с диска - зовёт наследник, когда его хост собран: разговорам он нужен с
   * первой строки.
   */
  protected restore(stored: StoredPanel): void {
    for (const conversation of stored.conversations) {
      this.runtimes.set(
        conversation.id,
        new ConversationRuntime(freshConversation(conversation), this.host, this.hooks),
      )
    }

    this.tabs.restore(stored.closed)
  }

  /** Общее состояние вкладок для окна. */
  protected coreState(): Pick<
    AgentPanelState,
    'conversations' | 'activeByProject' | 'closedByProject' | 'commandsByProject'
  > {
    return {
      conversations: [...this.runtimes.values()].map((runtime) => runtime.meta),
      activeByProject: this.activeByProject,
      closedByProject: this.tabs.closedByProject(),
      commandsByProject: this.commands.view,
    }
  }

  /** Лента разговора; прочитанный журнал отдаёт вкладке то, что знает о ней. */
  async getFeed(conversationId: string): Promise<ConversationFeed> {
    const runtime = this.runtime(conversationId)
    const feed = await runtime.getFeed()

    this.driver.feedLoaded(runtime)

    return feed
  }

  /**
   * Новая вкладка. Модель, усилие и режим - закреплённые в Settings → New chats, иначе
   * как у выбранной вкладки проекта.
   */
  async newConversation(projectPath: string): Promise<AgentPanelState> {
    await this.openConversation(projectPath, {})

    return this.getState()
  }

  /**
   * Новая вкладка с выбором сразу, до подъёма процесса (телефон): ответ - id созданной, а не
   * догадка по разнице списков, которую сбила бы вкладка, открытая в окне в ту же секунду.
   */
  async openConversation(projectPath: string, options: ConversationOptions): Promise<string> {
    const id = await this.addRuntime(projectPath, this.driver.newSessionId(), null)

    this.actions.setOptions(id, options)

    return id
  }

  /**
   * Режим новых вкладок человека в проекте: закреплённый в Settings → New chats (с поправкой на
   * проект), иначе по настройкам провайдера. Без соседней вкладки: так его берёт задание, которое
   * завёл агент (ADR 0121), - оно ни рядом с какой вкладкой не стоит.
   */
  async newTabMode(projectPath: string): Promise<PermissionMode> {
    const { newTabMode } = await this.driver.newTabPrefs(projectPath)

    return newTabMode ?? (await this.driver.defaultMode(projectPath))
  }

  activateConversation(conversationId: string): AgentPanelState {
    this.setActive(this.runtime(conversationId).meta.projectPath, conversationId)

    return this.getState()
  }

  /** Выбрать вкладку проекта; null - вкладок не осталось. */
  protected setActive(projectPath: string, conversationId: string | null): void {
    const { [projectPath]: _previous, ...rest } = this.activeByProject

    this.activeByProject = conversationId ? { ...rest, [projectPath]: conversationId } : rest
    this.persist.changed()
  }

  listHistory(projectPath: string): Promise<HistoryEntry[]> {
    const open = new Set(
      [...this.runtimes.values()]
        .filter((runtime) => runtime.meta.projectPath === projectPath)
        .map((runtime) => runtime.meta.sessionId),
    )

    return this.driver.listHistory(projectPath, open)
  }

  /**
   * Открыть прошлый разговор. Уже открыт - выбрать его вкладку: две сессии на одном
   * журнале писали бы в него наперегонки. Журнала нет - отказ: с чужим id вкладка начала
   * бы новую сессию под id, который выбрало окно. Имя берётся из журнала, а не из запроса.
   */
  async openHistory(projectPath: string, sessionId: string): Promise<AgentPanelState> {
    const open = [...this.runtimes.values()].find(
      (runtime) => runtime.meta.projectPath === projectPath && runtime.meta.sessionId === sessionId,
    )

    if (open) return this.activateConversation(open.meta.id)

    const name = await this.driver.journalName(projectPath, sessionId)

    if (name === undefined) throw new Error(`Журнала ${sessionId} нет`)

    await this.addRuntime(projectPath, sessionId, name)

    return this.getState()
  }

  /** Форк в новой вкладке рядом: тот же разговор до точки, дальше - своя ветка. */
  async fork(conversationId: string, beforeMessageId: string | null): Promise<AgentPanelState> {
    const source = this.runtime(conversationId).meta
    const { sessionId, origin } = await this.driver.forkSession(source, beforeMessageId)

    await this.addRuntime(source.projectPath, sessionId, null, source, origin)

    return this.getState()
  }

  /**
   * Поискать CLI заново: человек поставил его, пока IDE была открыта. byHand - он сам нажал
   * «искать заново»: окружение терминала (на Windows - PATH из реестра) читается заново,
   * установщик мог дописать туда свою папку.
   */
  async recheckCli(byHand = false): Promise<AgentPanelState> {
    if (byHand) forgetLoginShellEnv()

    if (await this.driver.recheckCli()) {
      await Promise.all(
        [...this.runtimes.values()].map((runtime) => runtime.resolveError('cli-not-found')),
      )
    }

    return this.getState()
  }

  /**
   * Выход из IDE: сессии, команды «!» и разовые команды CLI гасятся с ожиданием, а
   * вкладки дописываются на диск. Без ожидания таймер добивания не успел бы сработать, и
   * упрямый CLI пережил бы IDE вместе со своими MCP-серверами. extra - своё наследника.
   */
  async shutdown(extra: Promise<unknown> = Promise.resolve()): Promise<void> {
    const stopped = Promise.all([
      ...[...this.runtimes.values()].map((runtime) => runtime.dispose()),
      extra,
      ProcessGroup.stopAll(),
    ])

    await Promise.race([stopped, delay(SHUTDOWN_MAX_MS)])
    await this.persist.save()
  }

  /** Разговор по id из окна; нет такого - ошибка, а не тихий пропуск. */
  runtime(conversationId: string): ConversationRuntime {
    const runtime = this.runtimes.get(conversationId)

    if (!runtime) throw new Error(`Разговора ${conversationId} нет`)

    return runtime
  }

  scheduleBroadcast(): void {
    this.persist.scheduleBroadcast()
  }

  /**
   * Вкладка разговора, выбранная в своём проекте. Модель, усилие и режим - как у base
   * (форк продолжает свой источник и встаёт в его группу), иначе как у выбранной до неё
   * или закреплённые в Settings (new-tab.ts). Ответ - id вкладки.
   */
  protected async addRuntime(
    projectPath: string,
    sessionId: string,
    name: HistoryName,
    base?: Conversation,
    fork: ForkOrigin | null = null,
  ): Promise<string> {
    const current = this.runtimes.get(this.activeByProject[projectPath] ?? '')?.meta
    const prefs = await this.driver.newTabPrefs(projectPath)
    const defaultMode = (path: string) => this.driver.defaultMode(path)
    const tab = { projectPath, sessionId, name, base, fork, current, prefs, defaultMode }
    const conversation = await newTabConversation(tab)

    this.tabs.add(conversation)

    return conversation.id
  }

  /** Что о вкладках хранится на диске. */
  private stored(): StoredPanel {
    return {
      conversations: [...this.runtimes.values()].map((runtime) => toStored(runtime.meta)),
      closed: this.tabs.stored(),
      activeByProject: this.activeByProject,
      commandsByProject: this.commands.stored(),
      ...this.storedExtras(),
    }
  }
}
