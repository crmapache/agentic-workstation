import type { ClaudeService } from '../claude/claude-service'
import type { WorkspaceService } from '../workspace/workspace-service'
import { createClaudeTabsHandlers } from './claude-tabs-handlers'
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
import type { ComposerChannels } from './composer-handlers'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'
import { projectRootOf } from './workspace-handlers'

/** Каналы поля ввода (очередь, улучшение, вложения) - в composer-handlers.ts. */
type ClaudeChannels = Exclude<Extract<keyof InvokeHandlers, `claude:${string}`>, ComposerChannels>

/**
 * Каналы Claude Code: данные окна проверены, проект - по id открытой вкладки, дальше -
 * сервис main/claude. Окно не может назвать произвольную папку: только открытый проект.
 */
export const createClaudeHandlers = (
  workspace: WorkspaceService,
  claude: ClaudeService,
): Pick<InvokeHandlers, ClaudeChannels> => {
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
    ...createClaudeTabsHandlers(workspace, claude),
    'claude:getState': () => claude.getState(),
    'claude:getFeed': ({ conversationId }) => claude.getFeed(id(conversationId)),
    'claude:loadEarlier': ({ conversationId }) => claude.actions.loadEarlier(id(conversationId)),
    'claude:loadThrough': ({ conversationId, itemId }) =>
      claude.actions.loadThrough(id(conversationId), assertFeedItemId(itemId)),
    'claude:feedItems': ({ conversationId, itemIds }) =>
      claude.actions.feedItems(id(conversationId), parseFeedItemIds(itemIds)),
    'claude:showSessionInfo': ({ conversationId }) =>
      claude.actions.showSessionInfo(id(conversationId)),
    'claude:newConversation': ({ projectId }) => claude.newConversation(root(projectId)),
    'claude:activateConversation': ({ conversationId }) =>
      claude.activateConversation(id(conversationId)),
    'claude:send': ({ conversationId, ...message }) =>
      claude.actions.send(id(conversationId), parseOutgoing(message)),
    'claude:enqueue': ({ conversationId, before, ...message }) =>
      claude.actions.enqueue(id(conversationId), parseOutgoing(message), parseQueuePlace(before)),
    'claude:removeQueued': ({ conversationId, queuedId }) =>
      claude.actions.removeQueued(id(conversationId), queued(queuedId)),
    'claude:sendQueued': ({ conversationId, queuedId }) =>
      claude.actions.sendQueued(id(conversationId), queued(queuedId)),
    'claude:trustProject': ({ projectId }) => claude.trustProject(root(projectId)),
    'claude:interrupt': ({ conversationId }) => claude.actions.interrupt(id(conversationId)),
    'claude:forceStop': ({ conversationId }) => claude.actions.forceStop(id(conversationId)),
    'claude:respond': ({ conversationId, requestId, response }) => {
      assertString(requestId, 'requestId')

      return claude.actions.respond(id(conversationId), requestId, parseRequestResponse(response))
    },
    'claude:setOptions': ({ conversationId, options }) =>
      claude.actions.setOptions(id(conversationId), parseOptions(options)),
    'claude:listHistory': ({ projectId }) => claude.listHistory(root(projectId)),
    'claude:openHistory': ({ projectId, sessionId }) =>
      claude.openHistory(root(projectId), assertSessionId(sessionId)),
    'claude:recheckCli': () => claude.recheckCli(),
    'claude:getTodayTokens': () => claude.todayTokens.count(),
    // Разбор и проверка патча - в сервисе: там же значения по умолчанию и пределы.
    'claude:setPrefs': ({ patch }) => claude.setPrefs(patch),
    'claude:runShell': ({ conversationId, command }) =>
      claude.actions.runShell(id(conversationId), assertShellCommand(command)),
    'claude:stopShell': ({ conversationId, runId }) =>
      claude.actions.stopShell(id(conversationId), assertUuid(runId, 'runId')),
    'claude:stopTask': ({ conversationId, taskId }) =>
      claude.actions.stopTask(id(conversationId), assertCliName(taskId, 'taskId')),
    'claude:readFleetAgent': ({ conversationId, agentId }) =>
      claude.actions.readFleetAgent(id(conversationId), assertCliName(agentId, 'agentId')),
    'claude:revertChanges': ({ conversationId, turnId, path, restore }) => {
      assertString(turnId, 'turnId')
      if (path !== null) assertString(path, 'path')

      // Путь окна только называет строку итога хода: файлы берутся из самого итога.
      return claude.actions.revertChanges(id(conversationId), turnId, path, restore === true)
    },
    'claude:getImage': ({ conversationId, messageId, index }) =>
      claude.actions.getImage(
        id(conversationId),
        assertUuid(messageId, 'messageId'),
        assertIndex(index),
      ),
    'claude:previewRewind': ({ conversationId, messageId }) =>
      claude.actions.previewRewind(id(conversationId), assertUuid(messageId, 'messageId')),
    'claude:rewind': ({ conversationId, messageId, scope }) =>
      claude.actions.rewind(
        id(conversationId),
        assertUuid(messageId, 'messageId'),
        parseRewindScope(scope),
      ),
    'claude:fork': ({ conversationId, beforeMessageId }) =>
      claude.fork(
        id(conversationId),
        beforeMessageId === null ? null : assertUuid(beforeMessageId, 'beforeMessageId'),
      ),
  }
}
