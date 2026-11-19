import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../NoticeRow.module.scss'
import { usePanelAccounts } from '../../panel-accounts.hooks'
import { usePanelState } from '../../panel.queries'
import { usePanelStore } from '../../panel.store'

/**
 * Вход истёк, как в ACC: «Log in» - войти заново в аккаунт, на котором идут разговоры (как
 * входит провайдер), «Switch account» - только когда есть куда переключиться. Следующее
 * сообщение пойдёт в новом процессе.
 */
export const SignInActions = () => {
  const { t } = useTranslation()
  const panelAccounts = usePanelAccounts()
  const { data: state } = usePanelState()
  const openMenu = usePanelStore((store) => store.openMenu)
  const hasOthers = (state?.accounts.accounts.length ?? 0) > 1

  const handleSignIn = () => void panelAccounts.signIn(state?.accounts.current ?? '')

  const handleSwitch = () => openMenu('accounts')

  return (
    <>
      <div className={styles.actions}>
        <Button size="sm" variant="primary" onClick={handleSignIn}>
          {t('agentPanel.notice.logIn')}
        </Button>
        {hasOthers && (
          <Button size="sm" variant="secondary" onClick={handleSwitch}>
            {t('agentPanel.notice.switchAccount')}
          </Button>
        )}
      </div>
      <span className={styles.errorNote}>{t('agentPanel.notice.sendAgainAfter')}</span>
    </>
  )
}
