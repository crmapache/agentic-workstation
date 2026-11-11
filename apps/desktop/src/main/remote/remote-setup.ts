import { hostname } from 'node:os'
import { join } from 'node:path'

import type { ClaudeService } from '../claude/claude-service'
import { broadcast } from '../ipc/broadcast'
import { listProviders } from '../providers/provider-registry'
import type { ScenarioService } from '../scenarios/scenario-service'
import { JsonFile } from '../storage/json-file'
import type { WorkspaceService } from '../workspace/workspace-service'
import { RemoteService } from './remote-service'
import { RELAY_URL, REMOTE_FILE, RELAY_URL_ENV } from './remote.constants'
import type { ScenariosPort, ConversationsPort } from './bridge/bridge-ports'
import type { StoredRemote } from './store/remote-state'
import { safeVault } from './store/safe-vault'

/** Разговоры Claude Code для моста - теми же публичными методами, что зовёт окно. */
export const claudePort = (claude: ClaudeService): ConversationsPort => ({
  getState: () => claude.getState(),
  getFeed: (id) => claude.getFeed(id),
  send: (id, message) => claude.actions.send(id, message),
  respond: (id, requestId, response) => claude.actions.respond(id, requestId, response),
  interrupt: (id) => claude.actions.interrupt(id),
  newConversation: (projectPath) => claude.newConversation(projectPath),
  setOptions: (id, options) => claude.actions.setOptions(id, options),
  rename: (id, title) => claude.tabs.rename(id, title),
  providers: () => listProviders(claude),
})

/** Сценарии для моста - методы ScenarioService, как у каналов окна (scenarios-handlers.ts). */
export const scenariosPort = (scenarios: ScenarioService): ScenariosPort => ({
  queuesView: () => scenarios.queuesView(),
  start: (request) => scenarios.start(request),
  act: (queueId, action) => scenarios.act(queueId, action),
  run: (projectPath, runId) => scenarios.run(projectPath, runId),
  control: (projectPath, runId, action) => scenarios.control(projectPath, runId, action),
  answer: (projectPath, runId, allow, text) => scenarios.answer(projectPath, runId, allow, text),
  tell: (projectPath, runId, text, images) => scenarios.tell(projectPath, runId, text, images),
  carryOn: (runId) => scenarios.carryOn(runId),
  shelves: (projectPath) => scenarios.shelves.view(projectPath),
})

export type RemoteSetup = {
  claude: ClaudeService
  scenarios: ScenarioService
  workspace: WorkspaceService
  dataDir: string
  version: string
}

/**
 * Remote Control IDE (ADR 0041): сервис, его порты к разговорам и сценариям и связь с окном.
 * Адрес релея - свой домен владельца; переменная окружения - только для тестов и разработки.
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
      conversations: claudePort(setup.claude),
      scenarios: scenariosPort(setup.scenarios),
      workspace: setup.workspace,
    },
    relayUrl: process.env[RELAY_URL_ENV] || RELAY_URL,
    machine: () => machine,
    onView: (view) => broadcast('remote:state', view),
  })
}
