import { shell } from 'electron'

import type { ApplicationMenu } from '../menu'
import type { CalendarRuntime } from '../calendar/calendar-setup'
import type { ClaudeService } from '../claude/claude-service'
import type { ConnectorsService } from '../connectors/connectors-service'
import type { DefinitionService } from '../definitions/definition-service'
import type { ExtensionsRuntime } from '../extensions/extensions-setup'
import { FileOpsService } from '../fs/file-ops-service'
import type { OutsideWatchers } from '../fs/outside-watchers'
import type { GitStatusService } from '../git/git-status-service'
import type { LocalHistory } from '../history/local-history'
import type { IdePrefsService } from '../ide-prefs/ide-prefs-service'
import type { InboxService } from '../inbox/inbox-service'
import type { MemorySaverService } from '../memory-saver/memory-saver-service'
import type { OpenModelsService } from '../opencode/opencode-service'
import type { RemoteService } from '../remote/remote-service'
import type { ScenarioService } from '../scenarios/scenario-service'
import type { SearchService } from '../search/search-service'
import type { ServiceAiService } from '../service-ai/service-ai-service'
import type { SoundsService } from '../sounds/sounds-service'
import type { StatsService } from '../statistics/stats-service'
import type { TaskAuthor } from '../tasks/task-author'
import type { TaskService } from '../tasks/task-service'
import type { TerminalService } from '../terminal/terminal-service'
import type { TrackerRuntime } from '../tracker/tracker-setup'
import type { UpdateService } from '../updates/update-service'
import { RELEASE_PAGE_URL } from '../updates/update.constants'
import type { VoiceRuntime } from '../voice/voice-setup'
import type { PanelRegistry } from '../agents/panel/panel-registry'
import type { SearchDesk } from '../claude/search/search-desk'
import type { CommitPushDesk } from '../git/commit-push/commit-push'
import { createAccountsHandlers } from './accounts-handlers'
import { createAgentHandlers } from './agent-handlers'
import { createCalendarHandlers } from './calendar-handlers'
import { createClaudeHandlers } from './claude-handlers'
import { createClaudePanelHandlers } from './claude-panel-handlers'
import { createClaudeSearchHandlers } from './claude-search-handlers'
import { createClaudeSettingsHandlers } from './claude-settings-handlers'
import { createClaudeToolsHandlers } from './claude-tools-handlers'
import { createCommitPushHandlers } from './commit-push-handlers'
import { createComposerHandlers } from './composer-handlers'
import { createComputerHandlers } from './computer-handlers'
import { createConnectorsHandlers } from './connectors-handlers'
import { createEditorHandlers } from './editor-handlers'
import { createExtensionStoreHandlers } from './extension-store-handlers'
import { createExtensionsHandlers } from './extensions-handlers'
import { createFileOpsHandlers } from './file-ops-handlers'
import { createFsHandlers } from './fs-handlers'
import { createGitChangesHandlers } from './git-changes-handlers'
import { createGitHandlers } from './git-handlers'
import type { InvokeHandlers } from './handle'
import { createIdePrefsHandlers } from './ide-prefs-handlers'
import { createInboxHandlers } from './inbox-handlers'
import { createLocalHistoryHandlers } from './local-history-handlers'
import { createMemorySaverHandlers } from './memory-saver-handlers'
import { createOpenModelsHandlers } from './open-models-handlers'
import { createProjectSyncHandlers } from './project-sync-handlers'
import { createRemoteHandlers } from './remote-handlers'
import { createScenariosHandlers } from './scenarios-handlers'
import { createSearchHandlers } from './search-handlers'
import { createServiceAiHandlers } from './service-ai-handlers'
import { createSoundsHandlers } from './sounds-handlers'
import { createStatisticsHandlers } from './statistics-handlers'
import { createTasksHandlers } from './tasks-handlers'
import { createTerminalHandlers } from './terminal-handlers'
import { createTrackerHandlers } from './tracker-handlers'
import { createVoiceHandlers } from './voice-handlers'
import { createWindowHandlers } from './window-handlers'
import { createWorkspaceHandlers } from './workspace-handlers'
import type { HandlerContext } from './workspace-handlers'

type Services = HandlerContext & {
  updates: UpdateService
  search: SearchService
  claude: ClaudeService
  /** Панели провайдеров ИИ по id (ADR 0083): каналы agent:* берут панель отсюда. */
  panels: PanelRegistry
  /** Статусы git открытых проектов: перечитываются по слежению за диском. */
  gitStatus: GitStatusService
  /** Слежение за файлами вне проекта, открытыми вкладками редактора. */
  outsideWatchers: OutsideWatchers
  /** Поиск по разговорам панели Claude Code - своим модулем, мимо сервиса разговоров. */
  conversationSearch: SearchDesk
  /** Коннекторы к приложениям: их держит IDE, а не провайдер (ADR 0028). */
  connectors: ConnectorsService
  /** Оболочки терминала под панелью Claude Code (ADR 0037). */
  terminals: TerminalService
  /** Сценарии на уровне IDE: полки, очереди, прогоны (ADR 0039). */
  scenarios: ScenarioService
  /** Статистика IDE и провайдеров: база, транскрипты, живые события. */
  stats: StatsService
  /** Remote Control: связь с телефонами через свой релей (ADR 0041). */
  remote: RemoteService
  /** Локальная история файлов (ADR 0045): версии за месяц, возврат любой. */
  history: LocalHistory
  /** Звуки IDE (ADR 0046): чем и как громко зовут разговоры. */
  sounds: SoundsService
  /** Провайдер служебной работы IDE (Settings → AI). */
  serviceAi: ServiceAiService
  /** Голосовой режим (ADR 0104): настройки, ключ, звонок из панели. */
  voice: VoiceRuntime
  /** Общие настройки IDE (Settings): сворачивание вставки, кто пишет сообщение коммита. */
  idePrefs: IdePrefsService
  /** Кнопка Commit and push в шапке: сообщение от ИИ, коммит и push. */
  commitPush: CommitPushDesk
  /** «Где определено» для редактора (ADR 0061): компилятор TypeScript в своём процессе. */
  definitions: DefinitionService
  memorySaver: MemorySaverService
  /** Задания по расписанию (ADR 0069): задания, прогоны, их журналы. */
  tasks: TaskService
  /** ИИ пишет задание из слов человека - для формы, без сохранения. */
  taskAuthor: TaskAuthor
  /** Уведомления IDE (ADR 0069): вопросы прогонов, отчёты, напоминания от ИИ. */
  inbox: InboxService
  /** Панель открытых моделей (ADR 0084): её подключения - своими каналами. */
  openModels: OpenModelsService
  /** Расширения IDE (ADR 0091): песочницы, их вклад и работа с ИИ над ними. */
  extensions: ExtensionsRuntime
  /** Трекер задач (ADR 0101) и облако IDE (ADR 0102). */
  tracker: TrackerRuntime
  /** Календарь звонков (ADR 0114): источники, синк, накладки. */
  calendar: CalendarRuntime
  /** Меню приложения: кнопки полос окна в View (ADR 0112). */
  menu: ApplicationMenu
}

/**
 * Связка каналов контракта с сервисами, по областям. Обработчик только разбирает
 * запрос и зовёт сервис: логика живёт в сервисах и модулях, не здесь.
 */
export const createInvokeHandlers = (services: Services): InvokeHandlers => {
  const { workspace, updates, search, claude, history } = services

  return {
    ...createWorkspaceHandlers(services),
    ...createGitHandlers(workspace),
    ...createSearchHandlers(workspace, search),
    ...createFsHandlers(workspace, search),
    ...createFileOpsHandlers(
      workspace,
      new FileOpsService({
        listFiles: (root) => search.listFiles(root),
        trash: (absolute) => shell.trashItem(absolute),
        history,
      }),
    ),
    ...createLocalHistoryHandlers(workspace, history),
    ...createSoundsHandlers(services.sounds),
    ...createMemorySaverHandlers(services.memorySaver),
    ...createServiceAiHandlers(services.serviceAi),
    ...createVoiceHandlers(services.voice.service, () => {
      const home = services.workspace.getState().projects.find((project) => project.home)

      return home ? services.workspace.activateProject(home.id) : Promise.resolve()
    }),
    ...createIdePrefsHandlers(services.idePrefs),
    ...createCommitPushHandlers(workspace, services.commitPush),
    ...createTasksHandlers(workspace, services.tasks, services.taskAuthor),
    ...createInboxHandlers(services.inbox),
    ...createTrackerHandlers(
      workspace,
      services.tracker.tracker,
      services.tracker.runs,
      services.tracker.cloud,
    ),
    ...createCalendarHandlers(services.calendar),
    ...createOpenModelsHandlers(services.openModels),
    ...createEditorHandlers(workspace, history, services.definitions, (root, path) =>
      services.extensions.service.fileSaved(root, path),
    ),
    ...createExtensionsHandlers(services.extensions),
    ...createExtensionStoreHandlers(services.extensions.shop),
    ...createProjectSyncHandlers(workspace, services.gitStatus, services.outsideWatchers),
    ...createGitChangesHandlers(workspace, services.gitStatus),
    ...createAgentHandlers(workspace, services.panels),
    ...createClaudeHandlers(workspace, claude),
    ...createClaudeToolsHandlers(workspace, claude),
    ...createComposerHandlers(workspace, claude, services.getWindow),
    ...createAccountsHandlers(claude),
    ...createClaudePanelHandlers(claude),
    ...createClaudeSettingsHandlers(workspace, claude),
    ...createClaudeSearchHandlers(workspace, services.conversationSearch),
    ...createWindowHandlers(services.getWindow, services.menu),
    ...createConnectorsHandlers(services.connectors),
    ...createComputerHandlers(services.connectors.computer),
    ...createTerminalHandlers(workspace, services.terminals),
    ...createScenariosHandlers(
      workspace,
      { claude, panel: (id) => services.panels.find(id) },
      services.scenarios,
    ),
    ...createStatisticsHandlers(workspace, services.stats),
    ...createRemoteHandlers(services.remote),

    'updates:getStatus': () => updates.getStatus(),
    'updates:install': () => updates.install(),
    'updates:dismiss': () => updates.dismiss(),
    'updates:openReleasePage': () => shell.openExternal(RELEASE_PAGE_URL),
  }
}
