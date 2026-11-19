import type { ProviderId } from '@shared/providers'

import type { ClaudeService } from '../claude/claude-service'
import { providerOf, listProviders } from '../providers/provider-registry'
import type { AgentPanel } from '../agents/panel/agent-panel'
import type { PanelRegistry } from '../agents/panel/panel-registry'
import { findTranscript } from '../claude/history/transcript-paths'
import type { PanelsPort, ConversationsPort } from './bridge/bridge-ports'

/**
 * Разговоры панелей провайдеров для моста Remote Control (ADR 0041, 0083) - теми же публичными
 * методами, что зовёт окно через каналы agent:*. Общее у всех панелей - ядро AgentPanel; своё
 * Claude Code (выбор до процесса, слои настроек, транскрипт, продолжение, вопрос сбоку) - сверху.
 */

/** Панель провайдера: всё, что у неё есть в ядре. */
export const panelPort = (provider: ProviderId, panel: AgentPanel): ConversationsPort => ({
  provider,
  info: () => providerOf(provider, panel.getState()),
  getState: () => panel.getState(),
  getFeed: (id) => panel.getFeed(id),
  send: (id, message) => panel.actions.send(id, message),
  respond: (id, requestId, response) => panel.actions.respond(id, requestId, response),
  interrupt: (id) => panel.actions.interrupt(id),
  newConversation: (projectPath, options) => panel.openConversation(projectPath, options),
  close: (id) => panel.tabs.close(id, false),
  setOptions: (id, options) => panel.actions.setOptions(id, options),
  rename: (id, title) => panel.tabs.rename(id, title),
  history: (projectPath) => panel.listHistory(projectPath),
  /**
   * Прошлый разговор - вкладкой. Журнала нет - openHistory бросил бы; телефону это «не найдено»,
   * а не сбой. Есть ли журнал, говорит тот же список, по которому телефон его и выбрал.
   */
  openHistory: async (projectPath, sessionId) => {
    const known = (await panel.listHistory(projectPath)).some(
      (entry) => entry.sessionId === sessionId,
    )

    if (!known) return null

    return openedId(await panel.openHistory(projectPath, sessionId), projectPath, sessionId)
  },
  loadEarlier: (id) => panel.actions.loadEarlier(id),
  image: (id, messageId, index) => panel.actions.getImage(id, messageId, index),
  enqueue: (id, message) => panel.actions.enqueue(id, message),
  unqueue: (id, queuedId) => panel.actions.removeQueued(id, queuedId),
  moveQueued: (id, queuedId, toIndex) => panel.actions.moveQueued(id, queuedId, toIndex),
  sendQueued: (id, queuedId) => panel.actions.sendQueued(id, queuedId),
  forceStop: (id) => panel.actions.forceStop(id),
  stopTask: (id, taskId) => panel.actions.stopTask(id, taskId),
  rewindPreview: (id, messageId) => panel.actions.previewRewind(id, messageId),
  rewind: async (id, messageId, scope) =>
    (await panel.actions.rewind(id, messageId, scope)).outcome,
})

/** Вкладка прошлого разговора в состоянии панели после openHistory. */
const openedId = (
  state: ReturnType<AgentPanel['getState']>,
  projectPath: string,
  sessionId: string,
): string | null =>
  state.conversations.find(
    (conversation) =>
      conversation.projectPath === projectPath && conversation.sessionId === sessionId,
  )?.id ?? null

/** Claude Code: ядро панели и своё сверху. */
export const claudePort = (claude: ClaudeService): ConversationsPort => ({
  ...panelPort('claude', claude),
  // Выбор ложится на вкладку до того, как поднимется процесс; ответ - id созданной.
  newConversation: (projectPath, options) => claude.openConversation(projectPath, options),
  bypassDisabled: async (projectPath) =>
    (await claude.settings.projectInfo(projectPath)).bypassDisabled,
  openHistory: async (projectPath, sessionId) => {
    // Транскрипта нет - openHistory бросил бы; телефону это «не найдено», а не сбой.
    if (!(await findTranscript(projectPath, sessionId))) return null

    return openedId(await claude.openHistory(projectPath, sessionId), projectPath, sessionId)
  },
  cancelCarryOn: (id) => claude.panel.carryOn.cancel(id),
  askAside: (id, question, askId) => claude.panel.aside.askFor(id, question, askId),
  cancelAside: (id, askId) => claude.panel.aside.cancel(id, askId),
})

/** Провайдеры, у которых панель - только ядро AgentPanel. */
const CORE_PROVIDERS = ['codex', 'opencode'] as const

/**
 * Все панели IDE - мосту: первой Claude Code, за ней Codex и открытые модели, какие есть.
 * Файлы с телефона - в общий каталог вставок IDE (claude:savePasted зовёт поле любой панели).
 */
export const panelsPort = (claude: ClaudeService, registry: PanelRegistry): PanelsPort => {
  const others = CORE_PROVIDERS.flatMap((provider) => {
    const panel = registry.find(provider)

    return panel ? [panelPort(provider, panel)] : []
  })
  const list = [claudePort(claude), ...others]

  return {
    list: () => list,
    refresh: () =>
      listProviders({
        claude,
        codex: registry.find('codex'),
        opencode: registry.find('opencode'),
      }),
    saveFile: (name, data) => claude.composer.savePasted(name, data),
  }
}
