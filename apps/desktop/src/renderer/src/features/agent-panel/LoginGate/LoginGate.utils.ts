import type { AccountsState } from '@shared/accounts'
import type { AgentPanelState } from '@shared/conversation'

/**
 * Экран входа вместо панели: CLI нашёлся, а аккаунт в работе точно не вошёл. Поле ввода
 * без входа было бы нечестным: агент на каждое сообщение отвечал бы одной строкой про
 * /login, а /login в потоке недоступен.
 */
export const needsSignIn = (state: AgentPanelState | undefined): boolean => {
  if (state?.cli !== 'found') return false

  const { current, accounts } = state.accounts

  return accounts.find((account) => account.id === current)?.signedIn === false
}

/** Другие аккаунты, которые вошли: на экране входа - выход переключением, а не тупик. */
export const otherSignedIn = (accounts: AccountsState) =>
  accounts.accounts.filter((account) => account.id !== accounts.current && account.signedIn)
