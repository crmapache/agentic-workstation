import { useMemo } from 'react'

import type { RequestResponse, ConversationOptions } from '@shared/conversation'
import type { PanelPrefsPatch } from '@shared/panel-prefs'
import type { RewindScope } from '@shared/rewind'
import { useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { usePanelProvider } from '../../state/panel-provider.context'
import { QUERY_KEYS } from '../../state/query-keys'
import type { ComposerDraft, OutgoingMessage } from './draft.types'
import { applyDraft } from './field-bus'
import { usePutPanelState } from './panel-state.hooks'

/**
 * Действия над разговорами панели провайдера (каналы `agent:*`, ADR 0083). Ответ главного
 * процесса - состояние целиком, оно сразу ложится в кэш панели (usePutPanelState); сбой
 * связи - null. Аккаунты Claude - useClaudeAccounts. Объект действий один на всё время
 * жизни компонента.
 */
export const useConversationActions = () => {
  const queryClient = useQueryClient()
  const provider = usePanelProvider()
  const run = usePutPanelState(provider)

  return useMemo(() => {
    return {
      newConversation: (projectId: string) =>
        run(invoke('agent:newConversation', { provider, projectId })),
      /** Закрыть вкладку; hasDraft - в поле что-то написано, вкладку стоит помнить. */
      closeConversation: (conversationId: string, hasDraft = false) =>
        run(invoke('agent:closeConversation', { provider, conversationId, hasDraft })),
      activateConversation: (conversationId: string) =>
        run(invoke('agent:activateConversation', { provider, conversationId })),
      /** Вернуть закрытую вкладку на её место; closedId null - последнюю закрытую. */
      reopenClosed: (projectId: string, closedId: string | null = null) =>
        run(invoke('agent:reopenClosed', { provider, projectId, closedId })),
      /** Имя от человека: перебивает любое и уходит в транскрипт (`/rename` - сюда же). */
      rename: (conversationId: string, title: string) =>
        run(invoke('agent:rename', { provider, conversationId, title })),
      /** Группу форков целиком - перед группой beforeId, null - в конец полосы. */
      moveGroup: (groupId: string, beforeId: string | null) =>
        run(invoke('agent:moveGroup', { provider, groupId, beforeId })),
      moveTab: (conversationId: string, beforeId: string | null) =>
        run(invoke('agent:moveTab', { provider, conversationId, beforeId })),
      send: (conversationId: string, message: OutgoingMessage) =>
        run(invoke('agent:send', { provider, conversationId, ...message })),
      /** before - сосед в очереди, перед которым встать (сообщение вынимали поправить). */
      enqueue: (conversationId: string, message: OutgoingMessage, before: string | null = null) =>
        run(invoke('agent:enqueue', { provider, conversationId, ...message, before })),
      /** Вынуть сообщение очереди в поле: состояние - в кэш, само сообщение - тому, кто нажал. */
      takeQueued: (conversationId: string, queuedId: string) =>
        invoke('agent:takeQueued', { provider, conversationId, queuedId })
          .then(({ state, taken }) => {
            queryClient.setQueryData(QUERY_KEYS.agentState(provider), state)

            return taken
          })
          .catch((error: unknown) => {
            console.warn('[agent-panel] сообщение очереди не вынуто:', error)

            return null
          }),
      moveQueued: (conversationId: string, queuedId: string, toIndex: number) =>
        run(invoke('agent:moveQueued', { provider, conversationId, queuedId, toIndex })),
      removeQueued: (conversationId: string, queuedId: string) =>
        run(invoke('agent:removeQueued', { provider, conversationId, queuedId })),
      sendQueued: (conversationId: string, queuedId: string) =>
        run(invoke('agent:sendQueued', { provider, conversationId, queuedId })),
      trustProject: (projectId: string) =>
        run(invoke('agent:trustProject', { provider, projectId })),
      interrupt: (conversationId: string) =>
        run(invoke('agent:interrupt', { provider, conversationId })),
      forceStop: (conversationId: string) =>
        run(invoke('agent:forceStop', { provider, conversationId })),
      respond: (conversationId: string, requestId: string, response: RequestResponse) =>
        run(invoke('agent:respond', { provider, conversationId, requestId, response })),
      setOptions: (conversationId: string, options: ConversationOptions) =>
        run(invoke('agent:setOptions', { provider, conversationId, options })),
      openHistory: (projectId: string, sessionId: string) =>
        run(invoke('agent:openHistory', { provider, projectId, sessionId })),
      recheckCli: () => run(invoke('agent:recheckCli', { provider })),
      setPrefs: (patch: PanelPrefsPatch) => run(invoke('agent:setPrefs', { provider, patch })),
      revertChanges: (
        conversationId: string,
        turnId: string,
        path: string | null,
        restore: boolean,
      ) => run(invoke('agent:revertChanges', { provider, conversationId, turnId, path, restore })),
      runShell: (conversationId: string, command: string) =>
        run(invoke('agent:runShell', { provider, conversationId, command })),
      stopShell: (conversationId: string, runId: string) =>
        run(invoke('agent:stopShell', { provider, conversationId, runId })),
      /** /status: строка SESSION в ленте разговора. */
      showSessionInfo: (conversationId: string) =>
        run(invoke('agent:showSessionInfo', { provider, conversationId })),
      /**
       * Форк в новой вкладке. draft - сообщение, перед которым режут, кусками поля (чипы,
       * картинки, цитаты): оно ждёт в поле форка, его и собирались написать иначе.
       */
      fork: async (
        conversationId: string,
        beforeMessageId: string | null,
        draft: ComposerDraft | null = null,
      ) => {
        const state = await run(invoke('agent:fork', { provider, conversationId, beforeMessageId }))
        const source = state?.conversations.find((item) => item.id === conversationId)
        const forkId = source && state?.activeByProject[source.projectPath]

        if (forkId && draft) applyDraft(forkId, draft)

        return state
      },
      /** Откат: состояние - в кэш, итог - тому, кто нажал. Сбой связи - null. */
      rewind: (conversationId: string, messageId: string, scope: RewindScope) =>
        invoke('agent:rewind', { provider, conversationId, messageId, scope })
          .then(({ state, outcome }) => {
            queryClient.setQueryData(QUERY_KEYS.agentState(provider), state)

            return outcome
          })
          .catch((error: unknown) => {
            console.warn('[agent-panel] откат не выполнен:', error)

            return null
          }),
    }
  }, [queryClient, provider, run])
}
