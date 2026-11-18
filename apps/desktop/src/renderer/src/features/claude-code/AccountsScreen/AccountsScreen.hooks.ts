import { useState, useEffect } from 'react'

import type { AccountsState, ClaudeAccount } from '@shared/claude-accounts'

import { useClaudeAccounts } from '../claude-accounts.hooks'
import { ACCOUNTS_USAGE_REFRESH_MS } from '../usage.constants'
import { useUsageRefresh } from '../usage.hooks'
import type { AccountConfirm } from './AccountsScreen.types'

/**
 * Экран аккаунтов: при открытии спросить хранилища, вошёл ли CLI (это разовые запросы,
 * без разговора), лимиты вошедших - сразу и раз в минуту, пока экран открыт; дальше -
 * действия, вопрос перед «забыть» и «выйти», переименование.
 */
export const useAccountsScreen = (state: AccountsState) => {
  const accounts = useClaudeAccounts()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<AccountConfirm>(null)
  const [renaming, setRenaming] = useState<ClaudeAccount | null>(null)

  useEffect(() => {
    void accounts.refresh()
  }, [accounts])

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
    void run(() => (kind === 'logout' ? accounts.logout() : accounts.forget(account.id)))
  }

  const rename = (alias: string) => {
    if (renaming) void run(() => accounts.rename(renaming.id, alias))

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
    select: (account: ClaudeAccount) => void run(() => accounts.select(account.id)),
    signIn: (account: ClaudeAccount) => void run(() => accounts.signIn(account.id)),
    askForget: (account: ClaudeAccount) =>
      setConfirm({ kind: account.id === '' ? 'logout' : 'forget', account }),
    add: () => void run(() => accounts.add()),
    cancelSignIn: () => void accounts.cancelSignIn(),
    importAccount: (sourceId: string) => void run(() => accounts.import(sourceId)),
  }
}
