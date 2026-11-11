import { LogIn, RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { useClaudeActions } from '../claude-actions.hooks'
import { accountTitle } from '../AccountsScreen/AccountsScreen.utils'
import { useSignInCheck } from './LoginGate.hooks'
import styles from './LoginGate.module.scss'
import type { LoginGateProps } from './LoginGate.types'
import { otherSignedIn } from './LoginGate.utils'

/**
 * Экран вместо панели, пока аккаунт в работе не вошёл (как в ACC): «Sign in to Claude
 * Code» или «Sign in as X», вход в Терминале - в хранилище именно этого аккаунта, «Open
 * the terminal again», пока вход идёт, переключение на другой вошедший аккаунт и «Check
 * again». Вошёл - экран уходит сам.
 */
export const LoginGate = ({ accounts }: LoginGateProps) => {
  const { t } = useTranslation()
  const actions = useClaudeActions()
  const handleCheck = useSignInCheck()
  const current = accounts.accounts.find((account) => account.id === accounts.current)
  const isWaiting = accounts.signingIn === accounts.current
  const others = otherSignedIn(accounts)
  const problem = accounts.lastOutcome === 'open-failed' || accounts.lastOutcome === 'timeout'

  const handleLogIn = () => void actions.accounts.signIn(accounts.current)

  return (
    <EmptyState
      icon={LogIn}
      title={
        current && current.id !== ''
          ? t('claudeCode.loginGate.signInAs', { account: accountTitle(current, t) })
          : t('claudeCode.loginGate.signIn')
      }
      description={t('claudeCode.loginGate.text')}
      action={
        <div className={styles.action}>
          <Button variant="primary" icon={LogIn} onClick={handleLogIn}>
            {isWaiting ? t('claudeCode.loginGate.openAgain') : t('claudeCode.loginGate.logIn')}
          </Button>
          {problem && !isWaiting && (
            <p className={styles.problem}>
              {accounts.lastOutcome === 'timeout'
                ? t('claudeCode.accounts.timeout')
                : t('claudeCode.loginGate.noTerminal')}
            </p>
          )}
          {isWaiting && <p className={styles.waiting}>{t('claudeCode.loginGate.finish')}</p>}
          {others.length > 0 && (
            <div className={styles.switch}>
              <p className={styles.waiting}>{t('claudeCode.loginGate.orSwitch')}</p>
              <div className={styles.accounts}>
                {others.map((account) => (
                  <Button
                    key={account.id || 'default'}
                    size="sm"
                    onClick={() => void actions.accounts.select(account.id)}>
                    {accountTitle(account, t)}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <Button variant="ghost" icon={RotateCw} onClick={handleCheck}>
            {t('claudeCode.checkAgain')}
          </Button>
        </div>
      }
    />
  )
}
