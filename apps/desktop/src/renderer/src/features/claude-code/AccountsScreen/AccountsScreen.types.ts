import type { AccountsState, ClaudeAccount, ImportableAccount } from '@shared/claude-accounts'
import type { AccountUsage } from '@shared/claude-usage'

export type AccountsListProps = {
  accounts: AccountsState
}

export type AccountCardProps = {
  account: ClaudeAccount
  /** Лимиты аккаунта; нет - ещё не узнали или не вошёл. */
  usage: AccountUsage | undefined
  /** Лимит отказал аккаунту до этого момента (мс): метка на карточке. */
  refusedUntil?: number | undefined
  isCurrent: boolean
  busy: boolean
  onSelect: (account: ClaudeAccount) => void
  onSignIn: (account: ClaudeAccount) => void
  onRename: (account: ClaudeAccount) => void
  onForget: (account: ClaudeAccount) => void
}

export type DesignSignInProps = {
  /** Идёт действие или вход: кнопка Claude Design ждёт. */
  busy: boolean
}

export type ImportableListProps = {
  accounts: readonly ImportableAccount[]
  busy: boolean
  onImport: (sourceId: string) => void
}

/** Что спросить перед действием, которое не отменить одним нажатием. */
export type AccountConfirm = { kind: 'forget' | 'logout'; account: ClaudeAccount } | null

export type AccountDialogsProps = {
  confirm: AccountConfirm
  /** Аккаунт, которому дают имя; диалог монтируется заново на каждого (key). */
  renaming: ClaudeAccount | null
  onConfirm: () => void
  onCloseConfirm: () => void
  onRename: (alias: string) => void
  onCloseRename: () => void
}
