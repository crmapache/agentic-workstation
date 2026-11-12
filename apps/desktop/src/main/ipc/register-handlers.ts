import { shell } from 'electron'

import type { ClaudeService } from '../claude/claude-service'
import type { ConnectorsService } from '../connectors/connectors-service'
import { FileOpsService } from '../fs/file-ops-service'
import type { OutsideWatchers } from '../fs/outside-watchers'
import type { GitStatusService } from '../git/git-status-service'
import type { LocalHistory } from '../history/local-history'
import type { RemoteService } from '../remote/remote-service'
import type { ScenarioService } from '../scenarios/scenario-service'
import type { SearchService } from '../search/search-service'
import type { SoundsService } from '../sounds/sounds-service'
import type { StatsService } from '../statistics/stats-service'
import type { TerminalService } from '../terminal/terminal-service'
import type { UpdateService } from '../updates/update-service'
import { RELEASE_PAGE_URL } from '../updates/update.constants'
import type { SearchDesk } from '../claude/search/search-desk'
import { createAccountsHandlers } from './accounts-handlers'
import { createClaudeHandlers } from './claude-handlers'
import { createClaudePanelHandlers } from './claude-panel-handlers'
import { createClaudeSearchHandlers } from './claude-search-handlers'
import { createClaudeSettingsHandlers } from './claude-settings-handlers'
import { createClaudeToolsHandlers } from './claude-tools-handlers'
import { createComposerHandlers } from './composer-handlers'
import { createConnectorsHandlers } from './connectors-handlers'
import { createEditorHandlers } from './editor-handlers'
import { createFileOpsHandlers } from './file-ops-handlers'
import { createFsHandlers } from './fs-handlers'
import { createGitChangesHandlers } from './git-changes-handlers'
import { createGitHandlers } from './git-handlers'
import type { InvokeHandlers } from './handle'
import { createLocalHistoryHandlers } from './local-history-handlers'
import { createProjectSyncHandlers } from './project-sync-handlers'
import { createRemoteHandlers } from './remote-handlers'
import { createScenariosHandlers } from './scenarios-handlers'
import { createSearchHandlers } from './search-handlers'
import { createSoundsHandlers } from './sounds-handlers'
import { createStatisticsHandlers } from './statistics-handlers'
import { createTerminalHandlers } from './terminal-handlers'
import { createWindowHandlers } from './window-handlers'
import { createWorkspaceHandlers } from './workspace-handlers'
import type { HandlerContext } from './workspace-handlers'

type Services = HandlerContext & {
  updates: UpdateService
  search: SearchService
  claude: ClaudeService
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
    ...createEditorHandlers(workspace, history),
    ...createProjectSyncHandlers(workspace, services.gitStatus, services.outsideWatchers),
    ...createGitChangesHandlers(workspace, services.gitStatus),
    ...createClaudeHandlers(workspace, claude),
    ...createClaudeToolsHandlers(workspace, claude),
    ...createComposerHandlers(workspace, claude, services.getWindow),
    ...createAccountsHandlers(claude),
    ...createClaudePanelHandlers(claude),
    ...createClaudeSettingsHandlers(workspace, claude),
    ...createClaudeSearchHandlers(workspace, services.conversationSearch),
    ...createWindowHandlers(services.getWindow),
    ...createConnectorsHandlers(services.connectors),
    ...createTerminalHandlers(workspace, services.terminals),
    ...createScenariosHandlers(workspace, claude, services.scenarios),
    ...createStatisticsHandlers(workspace, services.stats),
    ...createRemoteHandlers(services.remote),

    'updates:getStatus': () => updates.getStatus(),
    'updates:install': () => updates.install(),
    'updates:dismiss': () => updates.dismiss(),
    'updates:openReleasePage': () => shell.openExternal(RELEASE_PAGE_URL),
  }
}
