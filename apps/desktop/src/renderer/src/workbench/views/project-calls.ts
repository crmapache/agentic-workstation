import { useTranslation } from 'react-i18next'

import { useClaudeCodeStore } from '../../features/claude-code/claude-code.store'
import { useClaudeState } from '../../features/claude-code/claude.queries'
import type { TabCall } from '../../features/claude-code/claude.types'
import { tabName } from '../../features/claude-code/ConversationTabs/ConversationTabs.utils'
import type { ProjectCall } from '../../features/projects/ProjectTab/ProjectTab.types'
import { projectCalls } from './project-calls.utils'

/**
 * Позвавшие разговоры по проектам - точки на вкладках проектов. Источник тот же, что у света
 * вкладки разговора (calls панели Claude Code): открыли разговор - гаснут оба. Звук из фонового
 * проекта так сразу показывает, откуда он и что там.
 */
export const useProjectCalls = (): ((rootPath: string) => readonly ProjectCall[]) => {
  const { t } = useTranslation()
  const calls = useClaudeCodeStore((store) => store.calls)
  const conversations = useClaudeState().data?.conversations ?? []

  const text = (conversationId: string, call: TabCall) => {
    const conversation = conversations.find((item) => item.id === conversationId)

    return t('projects.call', {
      chat: conversation ? tabName(conversation, t) : '',
      reason: t(`settings.sounds.events.${call.reason}.label`),
    })
  }

  return (rootPath) => projectCalls(conversations, calls, rootPath, text)
}
