import { useTranslation } from 'react-i18next'

import type { AccountsState } from '@shared/accounts'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'

import { OUTCOME_VIEWS } from '../AccountsScreen.constants'
import { usePanelAccounts } from '../../panel-accounts.hooks'
import { PanelScreen } from '../../PanelScreen/PanelScreen'
import styles from './AcpSignIn.module.scss'
import { AcpSignInStep } from './AcpSignInStep'

/**
 * Вход агента ACP (ADR 0092): один аккаунт, вход силами CLI агента. Antigravity открывает
 * страницу Google, а код с неё человек вставляет сюда; Kimi сам открывает страницу и
 * показывает код устройства, который вводят там. Пояснения - за «?» в шапке листа.
 */
export const AcpSignIn = ({ accounts }: { accounts: AccountsState }) => {
  const { t } = useTranslation()
  const panelAccounts = usePanelAccounts()
  const account = accounts.accounts[0]
  const step = accounts.step ?? null
  const isSigningIn = accounts.signingIn !== null
  const outcome = accounts.lastOutcome ? OUTCOME_VIEWS[accounts.lastOutcome] : null

  const handleSignIn = () => void panelAccounts.signIn('')
  const handleCancel = () => void panelAccounts.cancelSignIn()
  const handleSignOut = () => void panelAccounts.signOut('')

  return (
    <PanelScreen
      title={t('agentPanel.menu.titles.accounts.title')}
      notice={
        isSigningIn
          ? { tone: 'info', text: t('agentPanel.accounts.acp.waiting') }
          : outcome && { tone: outcome.tone, text: t(outcome.key) }
      }>
      <div className={styles.card}>
        <div className={styles.row}>
          <span className={styles.name}>
            {account?.email || t('agentPanel.accounts.acp.account')}
          </span>
          {account?.signedIn === true && (
            <Badge tone="success">{t('agentPanel.accounts.signedIn')}</Badge>
          )}
          {account?.signedIn === false && <Badge>{t('agentPanel.accounts.signedOut')}</Badge>}
        </div>
        {account?.plan && <span className={styles.plan}>{account.plan}</span>}
        {accounts.upgradeUrl && (
          <a className={styles.link} href={accounts.upgradeUrl} target="_blank" rel="noreferrer">
            {t('agentPanel.accounts.acp.upgrade')}
          </a>
        )}
      </div>

      {step && <AcpSignInStep step={step} />}

      <div className={styles.actions}>
        {isSigningIn ? (
          <Button size="sm" variant="ghost" onClick={handleCancel}>
            {t('agentPanel.accounts.cancel')}
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant={account?.signedIn === true ? 'secondary' : 'primary'}
              onClick={handleSignIn}>
              {t('agentPanel.accounts.signIn')}
            </Button>
            {account?.signedIn === true && (
              <Button size="sm" variant="ghost" onClick={handleSignOut}>
                {t('agentPanel.accounts.logout')}
              </Button>
            )}
          </>
        )}
      </div>
    </PanelScreen>
  )
}
