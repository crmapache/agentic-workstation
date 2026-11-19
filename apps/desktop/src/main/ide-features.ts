import type { BrowserWindow } from 'electron'

import type { AgentPanelState } from '@shared/conversation'
import type { FeedPatch } from '@shared/conversation-feed'
import type { ConversationCall } from '@shared/panel-prefs'
import type { ProviderId } from '@shared/providers'
import { PROVIDER_IDS } from '@shared/providers'
import { SECOND_MS } from '@shared/time-units'

import type { ClaudeService } from './claude/claude-service'
import type { ConnectorsService } from './connectors/connectors-service'
import type { DefinitionService } from './definitions/definition-service'
import { createDefinitionService } from './definitions/definition-setup'
import type { ExtensionsRuntime } from './extensions/extensions-setup'
import { startExtensions } from './extensions/extensions-setup'
import type { InboxLink } from './inbox/inbox-agent'
import type { InboxService } from './inbox/inbox-service'
import { broadcast } from './ipc/broadcast'
import { ProviderWatch } from './providers/provider-registry'
import type { ScenarioProvider } from './providers/scenario-provider'
import type { RemoteService } from './remote/remote-service'
import { startRemote } from './remote/remote-setup'
import type { ScenarioService } from './scenarios/scenario-service'
import type { ScenarioTaps } from './scenarios/scenarios-setup'
import { startScenarios } from './scenarios/scenarios-setup'
import type { ServiceAiService } from './service-ai/service-ai-service'
import type { Statistics } from './statistics/statistics-wiring'
import { startStatistics } from './statistics/statistics-wiring'
import type { TaskAuthor } from './tasks/task-author'
import type { TaskService } from './tasks/task-service'
import { startTasks } from './tasks/tasks-setup'
import type { WorkspaceService } from './workspace/workspace-service'
import { workstationPorts } from './workstation/workstation-ports'
import type { PanelRegistry } from './agents/panel/panel-registry'
import { latestSaying } from './claude/feed/latest-saying'
import type { SearchDesk } from './claude/search/search-desk'
import type { TasksPort } from './remote/bridge/bridge-ports'

/** Сколько выход из IDE ждёт возможности IDE поверх провайдеров. */
const FEATURES_SHUTDOWN_MAX_MS = 10 * SECOND_MS

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const warnShutdown = (error: unknown) =>
  console.warn('[app] возможность IDE не остановилась:', error)

export type IdeFeatures = {
  scenarios: ScenarioService
  statistics: Statistics
  remote: RemoteService
  /** Задания по расписанию и уведомления IDE (ADR 0069). */
  tasks: TaskService
  inbox: InboxService
  /** ИИ пишет задание из слов человека. */
  taskAuthor: TaskAuthor
  /**
   * «Где определено» для редактора (ADR 0061). Процесс с компилятором TypeScript поднимется первым
   * ⌘ + наведением в коде, а не со стартом IDE.
   */
  definitions: DefinitionService
  /** Состояние панели любого провайдера: список провайдеров, статистика, Remote Control. */
  observeState: (provider: ProviderId, state: AgentPanelState) => void
  /**
   * Живая заплатка ленты разговора любой панели: Remote Control (телефонам, которые смотрят
   * разговор) и капсула Computer.
   */
  observeFeed: (patch: FeedPatch) => void
  /** Разговор любой панели позвал человека: Remote Control будит телефон не на связи. */
  observeCall: (call: ConversationCall) => void
  /** Проекты открыли или закрыли. */
  projectsChanged: () => void
  /** Расширения IDE (ADR 0091): песочницы, работа с ИИ над ними, магазин. */
  extensions: ExtensionsRuntime
  /** Выход из IDE: связь с телефонами гаснет, прогоны пишутся остановленными, база закрывается. */
  shutdown: () => Promise<void>
}

/**
 * Возможности уровня IDE поверх провайдеров: сценарии (ADR 0039), статистика и Remote Control
 * (ADR 0041), задания и уведомления (ADR 0069), переход к определению в редакторе (ADR 0061).
 * Статистика слушает сценарии (итоги прогонов), Remote Control - сценарии и разговоры, поэтому
 * оба поднимаются после сценариев; задания пишут свои сессии в статистику - после неё.
 */
export const startIdeFeatures = async (setup: {
  claude: ClaudeService
  /** Панели всех провайдеров: задания, уведомления и сценарии ведут разговоры любой из них. */
  panels: PanelRegistry
  /** Провайдер служебной работы IDE (Settings → AI). */
  serviceAi: ServiceAiService
  /** Исполнители провайдеров без вкладки (run-providers.ts): сценарии и задания. */
  runners: ReadonlyMap<ProviderId, ScenarioProvider>
  workspace: WorkspaceService
  /** Поиск по разговорам и коннекторы - телефону Remote Control (чтение и переподключение). */
  search: SearchDesk
  connectors: ConnectorsService
  dataDir: string
  version: string
  getWindow: () => BrowserWindow | null
  /** Все звуки IDE выключены: уведомления ОС сценариев и заданий - без звука. */
  silent: () => boolean
  /** Связь коннектора уведомлений: в неё встанут уведомления IDE (ADR 0069). */
  inboxLink: InboxLink
  /** Папка расширений IDE (ADR 0091): своя у копии с отдельным профилем. */
  extensionsRoot: string
}): Promise<IdeFeatures> => {
  const { workspace, claude } = setup
  const taps: ScenarioTaps = { onQueues: () => undefined, onRun: () => undefined }
  // Прогоны заданий телефону: задания встают позже Remote Control, ручка заполняется после них.
  const taskRuns: TasksPort = { runs: () => [] }
  const { runners } = setup
  const scenarios = await startScenarios({
    ...setup,
    providers: [...runners.values()],
    service: () => setup.serviceAi.value.provider,
    taps,
  })
  const statistics = await startStatistics({
    dataDir: setup.dataDir,
    scenarios,
    workspace,
    chatIdOf: (provider, sessionId) =>
      runners.get(provider)?.chatIdOf(sessionId) ?? Promise.resolve(sessionId),
  })
  const remote = await startRemote({ ...setup, scenarios, tasks: taskRuns })
  // Задания и уведомления - после статистики: прогон заданий в ней - сессия IDE, а не человек.
  const automation = await startTasks({
    claude,
    panels: setup.panels,
    providers: runners,
    serviceAi: setup.serviceAi,
    connectors: setup.connectors,
    workspace,
    stats: statistics.stats,
    dataDir: setup.dataDir,
    getWindow: setup.getWindow,
    silent: setup.silent,
    inboxLink: setup.inboxLink,
    onTasks: () => remote.tasksChanged(),
  })
  const definitions = createDefinitionService()
  // Модели провайдера окно читает из его описания: новый каталог или своя модель - событием.
  const providers = new ProviderWatch((list) => broadcast('providers:changed', list), setup.panels)

  // Stop в капсуле Computer останавливает и ход разговора панели, который держал компьютер, - как
  // Stop в чате (ADR 0060). Процесс без разговора панели (сценарий) узнаёт об остановке отказом шага.
  setup.connectors.computer.stopped = (key) => {
    for (const provider of PROVIDER_IDS) {
      const panel = setup.panels.find(provider)

      if (panel?.getState().conversations.some((conversation) => conversation.id === key)) {
        panel.actions.interrupt(key)
      }
    }
  }
  // Коннектор самой IDE оживает, когда поднялось всё, чем он управляет; расширения - вслед за
  // портами: их ручка ide.control зовёт те же инструменты.
  let extensions: ExtensionsRuntime | null = null

  setup.connectors.workstation.ports = workstationPorts({
    workspace,
    scenarios,
    tasks: automation.tasks,
    claude,
    panels: setup.panels,
    extensions: () => extensions?.service ?? null,
  })
  extensions = await startExtensions({
    root: setup.extensionsRoot,
    userData: setup.dataDir,
    workspace,
    inbox: automation.inbox,
    workstation: setup.connectors.workstation,
    panels: setup.panels,
    connectors: setup.connectors,
  })
  // Прогоны, поднятые до этой строки (наверстывание при старте), телефон узнаёт сразу.
  taskRuns.runs = () => automation.tasks.view().runs
  remote.tasksChanged()
  taps.onQueues = () => remote.queuesChanged()
  taps.onRun = (run) => remote.runChanged(run)
  statistics.observe('claude', claude.getState())

  return {
    scenarios,
    statistics,
    remote,
    tasks: automation.tasks,
    inbox: automation.inbox,
    taskAuthor: automation.author,
    definitions,
    extensions,
    observeState: (provider, state) => {
      providers.changed(provider, state)
      statistics.observe(provider, state)
      remote.panelChanged()
    },
    observeFeed: (patch) => {
      remote.feedPatched(patch)

      // Последняя фраза разговора - капсуле Computer: пока модель думает между шагами, человек
      // видит, о чём (ADR 0057).
      const saying = latestSaying(patch)

      if (saying) setup.connectors.computer.heard(patch.conversationId, saying)
    },
    observeCall: (call) => remote.called(call),
    projectsChanged: () => {
      statistics.projectsChanged()
      scenarios.projectsChanged(workspace.getState().projects.map((project) => project.rootPath))
      remote.workspaceChanged()
    },
    shutdown: async () => {
      // Порядок важен (связь, потом прогоны, потом база), но выход не ждёт дольше потолка:
      // постановка сценария в worktree тянется минутами, а ⌘Q и установка обновления - нет.
      // Сбой одного шага не должен оставить IDE незакрываемой.
      const steps = async () => {
        // Расширения - первыми: их хуки и вызовы ходят в то, что гаснет ниже.
        await extensions?.shutdown().catch(warnShutdown)
        setup.connectors.workstation.ports = null
        await definitions.close().catch(warnShutdown)
        await automation.shutdown().catch(warnShutdown)
        await remote.shutdown().catch(warnShutdown)
        await scenarios.shutdown().catch(warnShutdown)
        await statistics.stats.close().catch(warnShutdown)
      }

      await Promise.race([steps(), delay(FEATURES_SHUTDOWN_MAX_MS)])
    },
  }
}
