import { useMemo } from 'react'

import { invoke } from '../../lib/ipc'
import { usePutPanelState } from './panel-state.hooks'

/**
 * Своё Claude Code у аккаунтов: проверка хранилищ и перенос из ACC. Вход, выход, новый,
 * выбор, имя, забыть - общими каналами провайдера (panel-accounts.hooks.ts), расход -
 * agent:refreshUsage. Ответ кладётся в состояние панели Claude, в какой бы панели ни нажали.
 */
export const useClaudeAccounts = () => {
  const run = usePutPanelState('claude')

  return useMemo(
    () => ({
      refresh: () => run(invoke('accounts:refresh')),
      import: (sourceId: string) => run(invoke('accounts:import', { sourceId })),
    }),
    [run],
  )
}
