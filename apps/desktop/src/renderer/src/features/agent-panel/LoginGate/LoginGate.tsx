import { LogIn, RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { usePanelAccounts } from '../panel-accounts.hooks'
import { accountTitle } from '../AccountsScreen/AccountsScreen.utils'
import { AcpSignInStep } from '../AccountsScreen/parts/AcpSignInStep'
import { useSignInCheck } from './LoginGate.hooks'
import styles from './LoginGate.module.scss'
import type { LoginGateProps } from './LoginGate.types'
import { otherSignedIn } from './LoginGate.utils'

/**
 * Экран вместо панели, пока аккаунт в работе не вошёл (как в ACC): «Sign in to Claude
 * Code» (у Codex - «to Codex») или «Sign in as X»; вход - как его ведёт провайдер (Claude -
 * Терминал, Codex - браузер), повторное нажатие, пока вход идёт, открывает его снова;
 * переключение на другой вошедший аккаунт и «Check again». Вошёл - экран уходит сам.
 */
export const LoginGate = ({ accounts }: LoginGateProps) => {
  const { t } = useTranslation()
  const panelAccounts = usePanelAccounts()
  const handleCheck = useSignInCheck()
  const current = accounts.accounts.find((account) => account.id === accounts.current)
  const isWaiting = accounts.signingIn === accounts.current
  const others = otherSignedIn(accounts)
  const problem = accounts.lastOutcome === 'open-failed' || accounts.lastOutcome === 'timeout'

  const handleLogIn = () => void panelAccounts.signIn(accounts.current)

  return (
    <EmptyState
      icon={LogIn}
      title={
        current && current.id !== ''
          ? t('agentPanel.loginGate.signInAs', { account: accountTitle(current, t) })
          : t('agentPanel.loginGate.signIn')
      }
      description={t('agentPanel.loginGate.text')}
      action={
        <div className={styles.action}>
          <Button variant="primary" icon={LogIn} onClick={handleLogIn}>
            {isWaiting ? t('agentPanel.loginGate.openAgain') : t('agentPanel.loginGate.logIn')}
          </Button>
          {problem && !isWaiting && (
            <p className={styles.problem}>
              {accounts.lastOutcome === 'timeout'
                ? t('agentPanel.accounts.timeout')
                : t('agentPanel.loginGate.noTerminal')}
            </p>
          )}
          {isWaiting && <p className={styles.waiting}>{t('agentPanel.loginGate.finish')}</p>}
          {/* Агент ACP: страница входа и код - здесь же, без похода в меню (ADR 0092). */}
          {accounts.step && <AcpSignInStep step={accounts.step} />}
          {others.length > 0 && (
            <div className={styles.switch}>
              <p className={styles.waiting}>{t('agentPanel.loginGate.orSwitch')}</p>
              <div className={styles.accounts}>
                {others.map((account) => (
                  <Button
                    key={account.id || 'default'}
                    size="sm"
                    onClick={() => void panelAccounts.select(account.id)}>
                    {accountTitle(account, t)}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <Button variant="ghost" icon={RotateCw} onClick={handleCheck}>
            {t('agentPanel.checkAgain')}
          </Button>
        </div>
      }
    />
  )
}
