import { useState, useEffect } from 'react'

import type { AccountsState, ClaudeAccount } from '@shared/accounts'

import { useClaudeAccounts } from '../claude-accounts.hooks'
import { usePanelAccounts } from '../panel-accounts.hooks'
import { usePanelCapabilities } from '../panel.queries'
import { ACCOUNTS_USAGE_REFRESH_MS } from '../usage.constants'
import { useUsageRefresh } from '../usage.hooks'
import type { AccountConfirm } from './AccountsScreen.types'

/**
 * Экран аккаунтов: при открытии спросить хранилища, вошёл ли CLI (это разовые запросы,
 * без разговора), лимиты вошедших - сразу и раз в минуту, пока экран открыт; дальше -
 * действия, вопрос перед «забыть» и «выйти», переименование - общими каналами провайдера
 * панели; проверка хранилищ при открытии и перенос из ACC - у Claude.
 */
export const useAccountsScreen = (state: AccountsState) => {
  const accounts = useClaudeAccounts()
  const panelAccounts = usePanelAccounts()
  const isClaude = usePanelCapabilities().accounts === 'claude'
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<AccountConfirm>(null)
  const [renaming, setRenaming] = useState<ClaudeAccount | null>(null)

  useEffect(() => {
    void (isClaude ? accounts.refresh() : panelAccounts.check())
  }, [accounts, panelAccounts, isClaude])

  useUsageRefresh(
    state.accounts.filter((account) => account.signedIn === true).map((account) => account.id),
    ACCOUNTS_USAGE_REFRESH_MS,
  )

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    await action()
    setBusy(false)
  }

  const confirmed = () => {
    if (!confirm) return

    const { kind, account } = confirm

    setConfirm(null)
    void run(() =>
      kind === 'logout' ? panelAccounts.signOut(account.id) : panelAccounts.forget(account.id),
    )
  }

  const rename = (alias: string) => {
    if (renaming) void run(() => panelAccounts.rename(renaming.id, alias))

    setRenaming(null)
  }

  return {
    busy,
    confirm,
    renaming,
    setRenaming,
    confirmed,
    rename,
    closeConfirm: () => setConfirm(null),
    select: (account: ClaudeAccount) => void run(() => panelAccounts.select(account.id)),
    signIn: (account: ClaudeAccount) => void run(() => panelAccounts.signIn(account.id)),
    askForget: (account: ClaudeAccount) =>
      setConfirm({ kind: account.id === '' ? 'logout' : 'forget', account }),
    add: () => void run(() => panelAccounts.add()),
    cancelSignIn: () => void panelAccounts.cancelSignIn(),
    importAccount: (sourceId: string) => void run(() => accounts.import(sourceId)),
  }
}
