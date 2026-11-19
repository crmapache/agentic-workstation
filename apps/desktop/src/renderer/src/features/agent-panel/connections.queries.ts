import { useMemo } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ConnectionRequest, OpenModelsConnections } from '@shared/ipc/open-models.contract'

import { invoke } from '../../lib/ipc'
import { useIpcEvent } from '../../lib/ipc.hooks'
import { QUERY_KEYS } from '../../state/query-keys'

/** Событие пробы подключений - в кэш; подписка одна на окно (MainProcessSync). */
export const useConnectionsSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('openModels:connections', (state) => {
    queryClient.setQueryData(QUERY_KEYS.openModelsConnections, state)
  })
}

/**
 * Подключения панели открытых моделей (ADR 0084): владелец - главный процесс, здесь - зеркало
 * под одним ключом; проба отвечает событием `openModels:connections` (useConnectionsSync) туда
 * же. enabled - спрашивать ли (у панели без подключений - нет).
 */
export const useConnections = (enabled = true) =>
  useQuery({
    queryKey: QUERY_KEYS.openModelsConnections,
    queryFn: () => invoke('openModels:getConnections'),
    staleTime: Infinity,
    enabled,
  }).data

/** Действия с подключениями: ответ - подключения целиком, сразу в кэш. */
export const useConnectionActions = () => {
  const queryClient = useQueryClient()

  return useMemo(() => {
    const put = (request: Promise<OpenModelsConnections>) =>
      request
        .then((state) => {
          queryClient.setQueryData(QUERY_KEYS.openModelsConnections, state)

          return true
        })
        .catch((error: unknown) => {
          console.warn('[open-models] подключение не сохранилось:', error)

          return false
        })

    return {
      refresh: () => put(invoke('openModels:refreshConnections')),
      add: (input: ConnectionRequest) => put(invoke('openModels:addConnection', input)),
      update: (id: string, input: ConnectionRequest) =>
        put(invoke('openModels:updateConnection', { ...input, id })),
      remove: (id: string) => put(invoke('openModels:removeConnection', { id })),
    }
  }, [queryClient])
}
