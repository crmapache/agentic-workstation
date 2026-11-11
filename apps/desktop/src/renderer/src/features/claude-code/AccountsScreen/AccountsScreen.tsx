import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { useClaudeState } from '../claude.queries'
import { PanelScreen } from '../PanelScreen/PanelScreen'
import { OUTCOME_VIEWS, UNAVAILABLE_KEYS } from './AccountsScreen.constants'
import { useAccountsScreen } from './AccountsScreen.hooks'
import styles from './AccountsScreen.module.scss'
import type { AccountsListProps } from './AccountsScreen.types'
import { AccountCard } from './parts/AccountCard'
import { AccountDialogs } from './parts/AccountDialogs'
import { DesignSignIn } from './parts/DesignSignIn'
import { ImportableList } from './parts/ImportableList'

/**
 * Аккаунты Claude: на каком идут разговоры, вошёл ли CLI в каждый, новый аккаунт, вход в
 * Claude Design и аккаунты, уже заведённые в amazing-claude-code. Вход идёт в Терминале -
 * панель ждёт его сама. Сменить аккаунт - разговоры перейдут на него, как только
 * освободятся. Пояснения - за «?» в шапке листа, а не абзацами здесь.
 */
export const AccountsScreen = () => {
  const accounts = useClaudeState().data?.accounts

  return accounts ? <AccountsList accounts={accounts} /> : null
}

const AccountsList = ({ accounts }: AccountsListProps) => {
  const { t } = useTranslation()
  const screen = useAccountsScreen(accounts)
  const isSigningIn = accounts.signingIn !== null
  const outcome = accounts.lastOutcome ? OUTCOME_VIEWS[accounts.lastOutcome] : null
  const unavailable = accounts.capability ? UNAVAILABLE_KEYS[accounts.capability] : undefined

  return (
    <PanelScreen
      title={t('claudeCode.menu.titles.accounts.title')}
      notice={
        isSigningIn
          ? { tone: 'info', text: t('claudeCode.accounts.waiting') }
          : outcome && { tone: outcome.tone, text: t(outcome.key) }
      }
      noticeAction={
        isSigningIn && (
          <Button size="sm" variant="ghost" onClick={screen.cancelSignIn}>
            {t('claudeCode.accounts.cancel')}
          </Button>
        )
      }>
      {/* Проба: CLI не держит два входа порознь - словами, почему (и Add неактивна). */}
      {unavailable && <div className={styles.unavailable}>{t(unavailable)}</div>}
      <ul className={styles.list}>
        {accounts.accounts.map((account) => (
          <AccountCard
            key={account.id || 'default'}
            account={account}
            usage={accounts.usage[account.id]}
            refusedUntil={accounts.refusedUntil?.[account.id]}
            isCurrent={account.id === accounts.current}
            busy={screen.busy || isSigningIn}
            onSelect={screen.select}
            onSignIn={screen.signIn}
            onRename={screen.setRenaming}
            onForget={screen.askForget}
          />
        ))}
      </ul>
      <div className={styles.footer}>
        <Button
          variant="primary"
          icon={Plus}
          disabled={screen.busy || isSigningIn || unavailable !== undefined}
          onClick={screen.add}>
          {t('claudeCode.accounts.add')}
        </Button>
        <DesignSignIn busy={screen.busy || isSigningIn} />
      </div>
      <ImportableList
        accounts={accounts.importable}
        busy={screen.busy}
        onImport={screen.importAccount}
      />
      <AccountDialogs
        key={screen.renaming?.id ?? 'none'}
        confirm={screen.confirm}
        renaming={screen.renaming}
        onConfirm={screen.confirmed}
        onCloseConfirm={screen.closeConfirm}
        onRename={screen.rename}
        onCloseRename={() => screen.setRenaming(null)}
      />
    </PanelScreen>
  )
}
