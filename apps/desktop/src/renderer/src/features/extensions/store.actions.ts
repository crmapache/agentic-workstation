import type { StoreResult } from '@shared/extension-store'
import { useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { QUERY_KEYS } from '../../state/query-keys'

/**
 * Действия магазина из окна. Установка кладёт новое состояние расширений в кэш; карточка,
 * обновления и каталог после записи перечитываются - их считает сервер.
 */
export const useStoreActions = () => {
  const queryClient = useQueryClient()
  const refresh = (id: string) => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.storeView(id) })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.storeUpdates })
    void queryClient.invalidateQueries({ queryKey: ['extensions', 'store', 'list'] })
  }
  const after = async <T>(
    id: string,
    pending: Promise<StoreResult<T>>,
  ): Promise<StoreResult<T>> => {
    const result = await pending

    if (result.ok) refresh(id)

    return result
  }

  return {
    install: async (id: string, version: string | null) => {
      const result = await after(id, invoke('extensions:storeInstall', { id, version }))

      if (result.ok) queryClient.setQueryData(QUERY_KEYS.extensions, result.value)

      return result
    },
    publish: (id: string) => after(id, invoke('extensions:storePublish', { id })),
    review: (id: string, rating: number, text: string) =>
      after(id, invoke('extensions:storeReview', { id, rating, text })),
    report: (id: string, reason: string) => invoke('extensions:storeReport', { id, reason }),
    unpublish: (id: string) => after(id, invoke('extensions:storeUnpublish', { id })),
    rename: async (name: string) => {
      const result = await invoke('extensions:storeRename', { name })

      if (result.ok) queryClient.setQueryData(QUERY_KEYS.storeIdentity, result)

      return result
    },
  }
}
