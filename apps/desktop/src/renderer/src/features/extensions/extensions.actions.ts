import type { ExtensionSettingValue, ExtensionsActionResult } from '@shared/extensions'
import { useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { QUERY_KEYS } from '../../state/query-keys'
import { useExtensionsStore } from './extensions.store'

/**
 * Действия с расширениями из окна: ответ - состояние целиком, оно сразу в кэше; отказ - в стор
 * вида, его покажет открытое окно. true - получилось.
 */
export const useExtensionActions = () => {
  const queryClient = useQueryClient()
  const fail = useExtensionsStore((store) => store.fail)
  const settle = async (pending: Promise<ExtensionsActionResult>): Promise<boolean> => {
    const result = await pending

    queryClient.setQueryData(QUERY_KEYS.extensions, result.state)
    fail(result.ok ? null : result.error)

    return result.ok
  }

  return {
    setEnabled: (id: string, enabled: boolean) =>
      settle(invoke('extensions:setEnabled', { id, enabled })),
    approve: (id: string) => settle(invoke('extensions:approve', { id })),
    reload: (id: string) => settle(invoke('extensions:reload', { id })),
    remove: (id: string) => settle(invoke('extensions:remove', { id })),
    setSetting: (id: string, key: string, value: ExtensionSettingValue) =>
      settle(invoke('extensions:setSetting', { id, key, value })),
    create: (name: string, request: string, provider: string) =>
      settle(invoke('extensions:create', { name, request, provider })),
    editWithAi: (id: string, request: string, provider: string) =>
      settle(invoke('extensions:editWithAi', { id, request, provider })),
    clearLogs: async (id: string) => {
      queryClient.setQueryData(
        QUERY_KEYS.extensionLogs(id),
        await invoke('extensions:clearLogs', { id }),
      )
    },
    reveal: (id: string | null) => invoke('extensions:reveal', { id }),
  }
}
