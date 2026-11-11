import { hostname } from 'node:os'
import { join } from 'node:path'

import { app } from 'electron'

import type { ClaudeService } from '../claude/claude-service'
import { broadcast } from '../ipc/broadcast'
import { listProviders } from '../providers/provider-registry'
import type { ScenarioService } from '../scenarios/scenario-service'
import { JsonFile } from '../storage/json-file'
import type { WorkspaceService } from '../workspace/workspace-service'
import { findTranscript } from '../claude/history/transcript-paths'
import { shrinkPicture } from '../claude/images/shrink-picture'
import { relayUrlFor } from './relay-url'
import { RemoteService } from './remote-service'
import { REMOTE_FILE } from './remote.constants'
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
  newConversation: (projectPath, options) => claude.openConversation(projectPath, options),
  close: (id) => claude.tabs.close(id, false),
  setOptions: (id, options) => claude.actions.setOptions(id, options),
  rename: (id, title) => claude.tabs.rename(id, title),
  providers: () => listProviders(claude),
  history: (projectPath) => claude.listHistory(projectPath),
  openHistory: async (projectPath, sessionId) => {
    // Транскрипта нет - openHistory бросил бы; телефону это «не найдено», а не сбой.
    if (!(await findTranscript(projectPath, sessionId))) return null

    const state = await claude.openHistory(projectPath, sessionId)
    const opened = state.conversations.find(
      (conversation) =>
        conversation.projectPath === projectPath && conversation.sessionId === sessionId,
    )

    return opened?.id ?? null
  },
  loadEarlier: (id) => claude.actions.loadEarlier(id),
  image: (id, messageId, index) => claude.actions.getImage(id, messageId, index),
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
      conversations: claudePort(setup.claude),
      scenarios: scenariosPort(setup.scenarios),
      workspace: setup.workspace,
      pictures: { shrink: shrinkPicture },
    },
    relayUrl: relayUrlFor(process.env, app.isPackaged),
    machine: () => machine,
    onView: (view) => broadcast('remote:state', view),
  })
}
