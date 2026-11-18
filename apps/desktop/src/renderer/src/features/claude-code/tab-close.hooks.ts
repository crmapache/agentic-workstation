import { useCallback } from 'react'

import type { ClaudeState, Conversation } from '@shared/claude'
import { useQueryClient } from '@tanstack/react-query'

import { usePanelProvider } from '../../state/panel-provider.context'
import { QUERY_KEYS } from '../../state/query-keys'
import { useClaudeActions } from './claude-actions.hooks'
import { useClaudeCodeStore } from './claude-code.store'
import { useComposerStore } from './composer.store'

/**
 * Закрыть вкладку разговора - одна дорога для крестика и ⌘W. Черновик остаётся в поле
 * под id вкладки: вернувшаяся вкладка найдёт его там же, а главный процесс узнаёт, что
 * пустую вкладку с черновиком стоит помнить. Закрыли последнюю вкладку проекта - экран
 * «Let's start», а не новая пустая сама собой (как в ACC).
 */
export const useCloseTab = () => {
  const queryClient = useQueryClient()
  const provider = usePanelProvider()
  const { closeConversation } = useClaudeActions()
  const setEmptied = useClaudeCodeStore((store) => store.setEmptied)

  return useCallback(
    (conversation: Conversation) => {
      const state = queryClient.getQueryData<ClaudeState>(QUERY_KEYS.agentState(provider))
      const left = state?.conversations.filter(
        (item) => item.projectPath === conversation.projectPath && item.id !== conversation.id,
      )
      const hasDraft = Boolean(useComposerStore.getState().drafts[conversation.id])

      if (left?.length === 0) setEmptied(conversation.projectPath, true)

      return closeConversation(conversation.id, hasDraft)
    },
    [queryClient, closeConversation, setEmptied, provider],
  )
}
