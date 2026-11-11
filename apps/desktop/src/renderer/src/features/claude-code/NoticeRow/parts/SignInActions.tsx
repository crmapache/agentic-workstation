import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../NoticeRow.module.scss'
import { useClaudeActions } from '../../claude-actions.hooks'
import { useClaudeCodeStore } from '../../claude-code.store'
import { useClaudeState } from '../../claude.queries'

/**
 * Вход истёк, как в ACC: «Log in» - войти заново в аккаунт, на котором идут разговоры
 * (Терминал), «Switch account» - только когда есть куда переключиться. Следующее
 * сообщение пойдёт в новом процессе.
 */
export const SignInActions = () => {
  const { t } = useTranslation()
  const { accounts } = useClaudeActions()
  const { data: state } = useClaudeState()
  const openMenu = useClaudeCodeStore((store) => store.openMenu)
  const hasOthers = (state?.accounts.accounts.length ?? 0) > 1

  const handleSignIn = () => void accounts.signIn(state?.accounts.current ?? '')

  const handleSwitch = () => openMenu('accounts')

  return (
    <>
      <div className={styles.actions}>
        <Button size="sm" variant="primary" onClick={handleSignIn}>
          {t('claudeCode.notice.logIn')}
        </Button>
        {hasOthers && (
          <Button size="sm" variant="secondary" onClick={handleSwitch}>
            {t('claudeCode.notice.switchAccount')}
          </Button>
        )}
      </div>
      <span className={styles.errorNote}>{t('claudeCode.notice.sendAgainAfter')}</span>
    </>
  )
}
