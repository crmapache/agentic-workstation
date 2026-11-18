import type { ClaudeService } from '../claude/claude-service'
import type { WorkspaceService } from '../workspace/workspace-service'
import { createClaudeTabsHandlers } from './claude-tabs-handlers'
import { assertCliName } from './claude-validate'
import type { ComposerChannels } from './composer-handlers'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'

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
  const id = (conversationId: unknown) => {
    assertString(conversationId, 'conversationId')

    return conversationId
  }
  return {
    ...createClaudeTabsHandlers(),
    'claude:getTodayTokens': () => claude.todayTokens.count(),
    'claude:readFleetAgent': ({ conversationId, agentId }) =>
      claude.readFleetAgent(id(conversationId), assertCliName(agentId, 'agentId')),
  }
}
