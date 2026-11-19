import { useCallback } from 'react'

import type { AgentPanelState } from '@shared/conversation'
import type { ProviderId } from '@shared/providers'
import { useQueryClient } from '@tanstack/react-query'

import { QUERY_KEYS } from '../../state/query-keys'

/**
 * Ответ главного процесса - состояние панели целиком - сразу в кэш (ADR 0003), под ключ
 * панели, чьё это состояние. owner - явно: общие каналы `agent:*` отвечают состоянием
 * панели из контекста, каналы Claude (аккаунты, вход, путь к CLI) - всегда состоянием
 * Claude, в какой бы панели ни нажали. Сбой канала - в журнал окна, ответ null: это сбой
 * связи с главным процессом, а не то, что человек может исправить.
 */
export const usePutPanelState = (owner: ProviderId) => {
  const queryClient = useQueryClient()

  return useCallback(
    (request: Promise<AgentPanelState>): Promise<AgentPanelState | null> =>
      request
        .then((state) => {
          queryClient.setQueryData(QUERY_KEYS.agentState(owner), state)

          return state
        })
        .catch((error: unknown) => {
          console.warn('[agent-panel] действие не выполнено:', error)

          return null
        }),
    [queryClient, owner],
  )
}
