import { useMemo } from 'react'

import { invoke } from '../../lib/ipc'
import { usePanelProvider } from '../../state/panel-provider.context'
import { usePutPanelState } from './panel-state.hooks'

/**
 * Вход и аккаунты провайдера своей панели - общими каналами `agent:*` (ADR 0083): Claude
 * входит в Терминале, Codex - в браузере через сам Codex; окну всё равно. Ответ - состояние
 * панели этого провайдера.
 */
export const usePanelAccounts = () => {
  const provider = usePanelProvider()
  const run = usePutPanelState(provider)

  return useMemo(
    () => ({
      signIn: (accountId: string) => run(invoke('agent:signIn', { provider, accountId })),
      cancelSignIn: () => run(invoke('agent:cancelSignIn', { provider })),
      check: () => run(invoke('agent:checkSignIn', { provider })),
      signOut: (accountId: string) => run(invoke('agent:signOut', { provider, accountId })),
      add: () => run(invoke('agent:addAccount', { provider })),
      select: (accountId: string) => run(invoke('agent:selectAccount', { provider, accountId })),
      rename: (accountId: string, alias: string) =>
        run(invoke('agent:renameAccount', { provider, accountId, alias })),
      forget: (accountId: string) => run(invoke('agent:forgetAccount', { provider, accountId })),
    }),
    [run, provider],
  )
}
