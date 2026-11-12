import { useQueryClient } from '@tanstack/react-query'

import type { AccountsWire } from '@agentic-workstation/remote-protocol/machine-wire-types'

import type { RouteOf } from '../../../lib/route.types'
import { useCommand } from '../../../state/commands.hooks'
import { useAccounts } from '../../../state/machine.queries'
import { queryKeys } from '../../../state/query-keys'
import { useInventory } from '../../../state/remote.queries'

/**
 * Аккаунты провайдера на машине и что с ними можно с телефона: выбрать другой вошедший,
 * переименовать, забыть добавленный, выйти из обычного входа. Ответ каждой команды - новый
 * список: он ложится в кэш, а не перезапрашивается.
 */
export const useAccountsScreen = (route: RouteOf<'accounts'>) => {
  const { agentId } = route
  const queryClient = useQueryClient()
  const accounts = useAccounts(agentId)
  const inventory = useInventory(agentId).data
  const use = useCommand(agentId, 'accounts.use')
  const rename = useCommand(agentId, 'accounts.rename')
  const forget = useCommand(agentId, 'accounts.forget')
  const logout = useCommand(agentId, 'accounts.logout')

  const store = (data: unknown) =>
    queryClient.setQueryData<AccountsWire>(queryKeys.accounts(agentId), data as AccountsWire)

  return {
    accounts,
    machine: inventory?.machine.label,
    offset: inventory ? inventory.at - inventory.receivedAt : 0,
    busy: use.isPending || rename.isPending || forget.isPending || logout.isPending,
    handleUse: (accountId: string) => use.mutate({ accountId }, { onSuccess: store }),
    handleRename: (accountId: string, alias: string) =>
      rename.mutate({ accountId, alias }, { onSuccess: store }),
    handleForget: (accountId: string) => forget.mutate({ accountId }, { onSuccess: store }),
    handleLogout: () => logout.mutate({}, { onSuccess: store }),
  }
}
