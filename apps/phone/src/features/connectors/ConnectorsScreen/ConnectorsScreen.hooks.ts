import { useQueryClient } from '@tanstack/react-query'

import type { ConnectorsWire } from '@agentic-workstation/remote-protocol/machine-wire-types'

import type { RouteOf } from '../../../lib/route.types'
import { useCommand } from '../../../state/commands.hooks'
import { useConnectors } from '../../../state/machine.queries'
import { queryKeys } from '../../../state/query-keys'
import { useInventory } from '../../../state/remote.queries'

/**
 * Коннекторы IDE на чтение и переподключение - ответ команды, новый список, ложится в кэш.
 * Какой коннектор переподключается сейчас - чтобы крутилась его кнопка, а не все.
 */
export const useConnectorsScreen = (route: RouteOf<'connectors'>) => {
  const { agentId } = route
  const queryClient = useQueryClient()
  const connectors = useConnectors(agentId)
  const inventory = useInventory(agentId).data
  const reconnect = useCommand(agentId, 'connectors.reconnect')

  const handleReconnect = (connectorId: string) =>
    reconnect.mutate(
      { connectorId },
      {
        onSuccess: (data) =>
          queryClient.setQueryData<ConnectorsWire>(
            queryKeys.connectors(agentId),
            data as ConnectorsWire,
          ),
      },
    )

  return {
    connectors,
    machine: inventory?.machine.label,
    reconnecting: reconnect.isPending ? reconnect.variables.connectorId : null,
    handleReconnect,
  }
}
