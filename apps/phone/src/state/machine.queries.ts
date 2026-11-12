import { useQuery } from '@tanstack/react-query'

import type {
  AccountsWire,
  ConnectorsWire,
} from '@agentic-workstation/remote-protocol/machine-wire-types'

import { useClient } from '../lib/client'
import { commandData } from './command-data'
import { queryKeys } from './query-keys'

/**
 * Аккаунты провайдера на машине - командой, когда экран открыт. Цифры лимитов меняются сами
 * по себе: экран просит свежие кнопкой, а ответ на действие (выбрать, переименовать, забыть)
 * ложится в кэш как новый список.
 */
export const useAccounts = (agentId: string) => {
  const client = useClient()

  return useQuery({
    queryKey: queryKeys.accounts(agentId),
    queryFn: async (): Promise<AccountsWire> =>
      (await commandData(client, agentId, 'accounts.list', {})) as AccountsWire,
  })
}

/** Коннекторы IDE - командой, когда экран открыт; переподключение отдаёт новый список. */
export const useConnectors = (agentId: string) => {
  const client = useClient()

  return useQuery({
    queryKey: queryKeys.connectors(agentId),
    queryFn: async (): Promise<ConnectorsWire> =>
      (await commandData(client, agentId, 'connectors.list', {})) as ConnectorsWire,
  })
}
