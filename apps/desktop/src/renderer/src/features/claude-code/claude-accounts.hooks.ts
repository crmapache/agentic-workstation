import { useMemo } from 'react'

import { invoke } from '../../lib/ipc'
import { usePutPanelState } from './panel-state.hooks'

/**
 * Аккаунты Claude Code: вход, выбор, имя, выход, перенос из ACC, расход. Каналы только
 * Claude - ответ кладётся в состояние панели Claude, в какой бы панели ни нажали. Объект
 * действий один на всё время жизни компонента.
 */
export const useClaudeAccounts = () => {
  const run = usePutPanelState('claude')

  return useMemo(
    () => ({
      refresh: () => run(invoke('accounts:refresh')),
      refreshUsage: (accountIds: string[]) => run(invoke('accounts:refreshUsage', { accountIds })),
      add: () => run(invoke('accounts:add')),
      signIn: (accountId: string) => run(invoke('accounts:signIn', { accountId })),
      cancelSignIn: () => run(invoke('accounts:cancelSignIn')),
      select: (accountId: string) => run(invoke('accounts:select', { accountId })),
      rename: (accountId: string, alias: string) =>
        run(invoke('accounts:rename', { accountId, alias })),
      forget: (accountId: string) => run(invoke('accounts:forget', { accountId })),
      logout: () => run(invoke('accounts:logout')),
      import: (sourceId: string) => run(invoke('accounts:import', { sourceId })),
    }),
    [run],
  )
}
