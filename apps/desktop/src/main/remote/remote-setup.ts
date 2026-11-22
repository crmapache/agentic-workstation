import { hostname } from 'node:os'
import { join } from 'node:path'

import { app } from 'electron'

import type { ClaudeService } from '../claude/claude-service'
import type { ConnectorsService } from '../connectors/connectors-service'
import { broadcast } from '../ipc/broadcast'
import type { ScenarioService } from '../scenarios/scenario-service'
import { JsonFile } from '../storage/json-file'
import type { WorkspaceService } from '../workspace/workspace-service'
import { shrinkPicture } from '../agents/images/shrink-picture'
import type { PanelRegistry } from '../agents/panel/panel-registry'
import type { SearchDesk } from '../claude/search/search-desk'
import { panelsPort } from './panel-ports'
import { relayUrlFor } from './relay-url'
import { RemoteService } from './remote-service'
import { REMOTE_FILE } from './remote.constants'
import type {
  TasksPort,
  VoicePort,
  SearchPort,
  AccountsPort,
  ScenariosPort,
  WorkspacePort,
  ConnectorsPort,
} from './bridge/bridge-ports'
import type { StoredRemote } from './store/remote-state'
import { safeVault } from './store/safe-vault'

/** Аккаунты Claude для моста - те же действия, что у каналов accounts:* окна. */
export const accountsPort = (claude: ClaudeService): AccountsPort => ({
  state: () => claude.getState().accounts,
  refreshUsage: (accountIds) => claude.usage.refresh(accountIds),
  use: (accountId) => {
    claude.accounts.select(accountId)
    // Выбор того же аккаунта тоже переводит всё: вкладка могла отстать на старом входе.
    claude.panel.accountChanged()
  },
  rename: (accountId, alias) => claude.accounts.rename(accountId, alias),
  forget: (accountId) => claude.accounts.forget(accountId),
  logout: () => claude.panel.logout(),
})

/** Поиск по разговорам: набранный - по всему проекту, без переключателей поля окна. */
export const searchPort = (search: SearchDesk): SearchPort => ({
  find: (projectPath, query) =>
    search.find(projectPath, {
      sessionId: null,
      scope: 'project',
      query,
      matchCase: false,
      wholeWords: false,
    }),
  ask: (projectPath, runId, query) => search.ask(projectPath, runId, query),
  cancel: (runId) => search.cancel(runId),
})

/** Коннекторы IDE: список и переподключение (connectors:get, connectors:refresh). */
export const connectorsPort = (connectors: ConnectorsService): ConnectorsPort => ({
  list: () => connectors.getState().connectors,
  reconnect: (connectorId) => connectors.refresh(connectorId),
})

export const workspacePort = (workspace: WorkspaceService): WorkspacePort => ({
  getState: () => workspace.getState(),
  openRecent: (rootPath) => workspace.openRecentProject(rootPath),
})

/** Сценарии для моста - методы ScenarioService, как у каналов окна (scenarios-handlers.ts). */
export const scenariosPort = (scenarios: ScenarioService): ScenariosPort => ({
  queuesView: () => scenarios.queuesView(),
  start: (request) => scenarios.start(request),
  act: (queueId, action) => scenarios.act(queueId, action),
  run: (projectPath, runId) => scenarios.run(projectPath, runId),
  control: (projectPath, runId, action, seen) =>
    scenarios.control(projectPath, runId, action, seen),
  answer: (projectPath, runId, allow, text, asked) =>
    scenarios.answer(projectPath, runId, allow, text, asked),
  tell: (projectPath, runId, text, images) => scenarios.tell(projectPath, runId, text, images),
  carryOn: (runId) => scenarios.carryOn(runId),
  shelves: (projectPath) => scenarios.shelves.view(projectPath),
  fetch: (projectPath, id, scope) => scenarios.shelves.fetch(projectPath, id, scope),
  duplicate: (projectPath, id, scope) => scenarios.shelves.duplicate(projectPath, id, scope),
  delete: (projectPath, id, scope) => scenarios.shelves.delete(projectPath, id, scope),
  draft: (projectPath, draftId, description, scope) =>
    scenarios.shelves.draft(projectPath, draftId, description, scope),
  cancelDraft: (draftId) => scenarios.shelves.cancelDraft(draftId),
  save: (projectPath, scenario, scope) => scenarios.shelves.save(projectPath, scenario, scope),
  log: (projectPath, runId, key, earlier) => scenarios.log(projectPath, runId, key, earlier),
  starRun: (projectPath, runId, starred) => scenarios.shelves.starRun(projectPath, runId, starred),
  deleteRun: (projectPath, runId) => scenarios.shelves.deleteRun(projectPath, runId),
  schedule: (projectPath, hour) => scenarios.schedule(projectPath, hour),
  unschedule: (projectPath, scheduleId) => scenarios.unschedule(projectPath, scheduleId),
})

export type RemoteSetup = {
  claude: ClaudeService
  /** Панели всех провайдеров: телефон видит разговоры каждой (ADR 0083). */
  panels: PanelRegistry
  scenarios: ScenarioService
  /**
   * Прогоны заданий. Задания поднимаются после Remote Control (им нужна статистика), поэтому
   * порт - позже заполняемая ручка, как taps сценариев.
   */
  tasks: TasksPort
  workspace: WorkspaceService
  search: SearchDesk
  connectors: ConnectorsService
  dataDir: string
  version: string
  /** Голосовой режим (ADR 0104): звонок с телефона. */
  voice?: VoicePort | undefined
}

/**
 * Remote Control IDE (ADR 0041): сервис, его порты к разговорам и сценариям и связь с окном.
 * Адрес релея - свой домен владельца; переменная окружения - только у несобранной IDE.
 */
export const startRemote = (setup: RemoteSetup): Promise<RemoteService> => {
  const machine = {
    label: `Agentic Workstation on ${hostname().split('.')[0] ?? 'Mac'}`,
    ideVersion: setup.version,
  }

  return RemoteService.load({
    file: new JsonFile<StoredRemote>(join(setup.dataDir, REMOTE_FILE), { mode: 0o600 }),
    vault: safeVault,
    ports: {
      panels: panelsPort(setup.claude, setup.panels),
      scenarios: scenariosPort(setup.scenarios),
      tasks: setup.tasks,
      workspace: workspacePort(setup.workspace),
      pictures: { shrink: shrinkPicture },
      search: searchPort(setup.search),
      accounts: accountsPort(setup.claude),
      connectors: connectorsPort(setup.connectors),
      voice: setup.voice,
    },
    relayUrl: relayUrlFor(process.env, app.isPackaged),
    machine: () => machine,
    onView: (view) => broadcast('remote:state', view),
  })
}
