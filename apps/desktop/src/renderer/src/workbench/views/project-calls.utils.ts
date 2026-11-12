import type { Conversation } from '@shared/claude'

import type { TabCall } from '../../features/claude-code/claude.types'
import type { ProjectCall } from '../../features/projects/ProjectTab/ProjectTab.types'

/**
 * Позвавшие разговоры одного проекта, от старого зова к новому. Разговор, которого уже нет
 * в состоянии (закрыли), не зовёт: его свет уходит вместе с вкладкой.
 */
export const projectCalls = (
  conversations: readonly Pick<Conversation, 'id' | 'projectPath'>[],
  calls: Readonly<Record<string, TabCall>>,
  rootPath: string,
  text: (conversationId: string, call: TabCall) => string,
): ProjectCall[] =>
  conversations
    .flatMap((conversation) => {
      const call = conversation.projectPath === rootPath ? calls[conversation.id] : undefined

      return call ? [{ id: conversation.id, call }] : []
    })
    .sort((a, b) => a.call.at - b.call.at)
    .map(({ id, call }) => ({ id, tone: call.tone, at: call.at, text: text(id, call) }))
