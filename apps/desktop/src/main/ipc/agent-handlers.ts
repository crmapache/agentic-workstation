import type { WorkspaceService } from '../workspace/workspace-service'
import type { PanelRegistry } from '../agents/panel/panel-registry'
import {
  assertUuid,
  assertIndex,
  parseOptions,
  assertCliName,
  parseOutgoing,
  assertSessionId,
  parseQueuePlace,
  assertFeedItemId,
  parseFeedItemIds,
  parseRewindScope,
  assertShellCommand,
  parseRequestResponse,
} from './claude-validate'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'
import { projectRootOf } from './workspace-handlers'

type AgentChannels = Extract<keyof InvokeHandlers, `agent:${string}`>

/** id вкладки, группы или соседа; null - «в конец». */
const idOrNull = (value: unknown, name: string): string | null => {
  if (value === null) return null

  assertString(value, name)

  return value
}

/**
 * Каналы панелей провайдеров (ADR 0083): панель - по провайдеру из запроса, данные окна
 * проверены, проект - по id открытой вкладки. Окно не может назвать произвольную папку:
 * только открытый проект.
 */
export const createAgentHandlers = (
  workspace: WorkspaceService,
  panels: PanelRegistry,
): Pick<InvokeHandlers, AgentChannels> => {
  const root = (projectId: unknown) => projectRootOf(workspace, projectId)
  const id = (conversationId: unknown) => {
    assertString(conversationId, 'conversationId')

    return conversationId
  }
  const queued = (queuedId: unknown) => {
    assertString(queuedId, 'queuedId')

    return queuedId
  }

  return {
    'agent:getState': ({ provider }) => panels.get(provider).getState(),
    'agent:getFeed': ({ provider, conversationId }) =>
      panels.get(provider).getFeed(id(conversationId)),
    'agent:loadEarlier': ({ provider, conversationId }) =>
      panels.get(provider).actions.loadEarlier(id(conversationId)),
    'agent:loadThrough': ({ provider, conversationId, itemId }) =>
      panels.get(provider).actions.loadThrough(id(conversationId), assertFeedItemId(itemId)),
    'agent:feedItems': ({ provider, conversationId, itemIds }) =>
      panels.get(provider).actions.feedItems(id(conversationId), parseFeedItemIds(itemIds)),
    'agent:showSessionInfo': ({ provider, conversationId }) =>
      panels.get(provider).actions.showSessionInfo(id(conversationId)),
    'agent:newConversation': ({ provider, projectId }) =>
      panels.get(provider).newConversation(root(projectId)),
    'agent:activateConversation': ({ provider, conversationId }) =>
      panels.get(provider).activateConversation(id(conversationId)),
    'agent:send': ({ provider, conversationId, ...message }) =>
      panels.get(provider).actions.send(id(conversationId), parseOutgoing(message)),
    'agent:enqueue': ({ provider, conversationId, before, ...message }) =>
      panels
        .get(provider)
        .actions.enqueue(id(conversationId), parseOutgoing(message), parseQueuePlace(before)),
    'agent:removeQueued': ({ provider, conversationId, queuedId }) =>
      panels.get(provider).actions.removeQueued(id(conversationId), queued(queuedId)),
    'agent:sendQueued': ({ provider, conversationId, queuedId }) =>
      panels.get(provider).actions.sendQueued(id(conversationId), queued(queuedId)),
    'agent:trustProject': ({ provider, projectId }) =>
      panels.get(provider).trustProject(root(projectId)),
    'agent:interrupt': ({ provider, conversationId }) =>
      panels.get(provider).actions.interrupt(id(conversationId)),
    'agent:forceStop': ({ provider, conversationId }) =>
      panels.get(provider).actions.forceStop(id(conversationId)),
    'agent:respond': ({ provider, conversationId, requestId, response }) => {
      assertString(requestId, 'requestId')

      return panels
        .get(provider)
        .actions.respond(id(conversationId), requestId, parseRequestResponse(response))
    },
    'agent:setOptions': ({ provider, conversationId, options }) =>
      panels.get(provider).actions.setOptions(id(conversationId), parseOptions(options)),
    'agent:listHistory': ({ provider, projectId }) =>
      panels.get(provider).listHistory(root(projectId)),
    'agent:openHistory': ({ provider, projectId, sessionId }) =>
      panels.get(provider).openHistory(root(projectId), assertSessionId(sessionId)),
    'agent:recheckCli': ({ provider }) => panels.get(provider).recheckCli(),
    'agent:runShell': ({ provider, conversationId, command }) =>
      panels.get(provider).actions.runShell(id(conversationId), assertShellCommand(command)),
    'agent:stopShell': ({ provider, conversationId, runId }) =>
      panels.get(provider).actions.stopShell(id(conversationId), assertUuid(runId, 'runId')),
    'agent:stopTask': ({ provider, conversationId, taskId }) =>
      panels.get(provider).actions.stopTask(id(conversationId), assertCliName(taskId, 'taskId')),
    'agent:revertChanges': ({ provider, conversationId, turnId, path, restore }) => {
      assertString(turnId, 'turnId')
      if (path !== null) assertString(path, 'path')

      // Путь окна только называет строку итога хода: файлы берутся из самого итога.
      return panels
        .get(provider)
        .actions.revertChanges(id(conversationId), turnId, path, restore === true)
    },
    'agent:getImage': ({ provider, conversationId, messageId, index }) =>
      panels
        .get(provider)
        .actions.getImage(
          id(conversationId),
          assertUuid(messageId, 'messageId'),
          assertIndex(index),
        ),
    'agent:previewRewind': ({ provider, conversationId, messageId }) =>
      panels
        .get(provider)
        .actions.previewRewind(id(conversationId), assertUuid(messageId, 'messageId')),
    'agent:rewind': ({ provider, conversationId, messageId, scope }) =>
      panels
        .get(provider)
        .actions.rewind(
          id(conversationId),
          assertUuid(messageId, 'messageId'),
          parseRewindScope(scope),
        ),
    'agent:fork': ({ provider, conversationId, beforeMessageId }) =>
      panels
        .get(provider)
        .fork(
          id(conversationId),
          beforeMessageId === null ? null : assertUuid(beforeMessageId, 'beforeMessageId'),
        ),
    'agent:closeConversation': ({ provider, conversationId, hasDraft }) =>
      panels.get(provider).tabs.close(id(conversationId), hasDraft === true),
    'agent:reopenClosed': ({ provider, projectId, closedId }) =>
      panels.get(provider).tabs.reopen(root(projectId), idOrNull(closedId, 'closedId')),
    'agent:rename': ({ provider, conversationId, title }) => {
      assertString(title, 'title')

      // Длину и вид имени приводит сервис (agents/tabs/tab-names.ts): окно присылает как набрано.
      return panels.get(provider).tabs.rename(id(conversationId), title)
    },
    'agent:moveTab': ({ provider, conversationId, beforeId }) =>
      panels.get(provider).tabs.moveTab(id(conversationId), idOrNull(beforeId, 'beforeId')),
    'agent:moveGroup': ({ provider, groupId, beforeId }) => {
      assertString(groupId, 'groupId')

      return panels.get(provider).tabs.moveGroup(groupId, idOrNull(beforeId, 'beforeId'))
    },
    // Разбор и проверка патча - у панели: там же значения по умолчанию и пределы.
    'agent:setPrefs': ({ provider, patch }) => panels.get(provider).setPrefs(patch),
    'agent:takeQueued': ({ provider, conversationId, queuedId }) => {
      const panel = panels.get(provider)
      const taken = panel.runtime(id(conversationId)).outbox.takeOut(queued(queuedId))

      return { state: panel.getState(), taken }
    },
    'agent:moveQueued': ({ provider, conversationId, queuedId, toIndex }) => {
      if (typeof toIndex !== 'number' || !Number.isInteger(toIndex) || toIndex < 0) {
        throw new Error('Недопустимое место в очереди')
      }

      return panels.get(provider).actions.moveQueued(id(conversationId), queued(queuedId), toIndex)
    },
  }
}
