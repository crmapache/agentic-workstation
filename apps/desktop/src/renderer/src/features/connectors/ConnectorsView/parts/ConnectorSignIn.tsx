import { LogIn, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../ConnectorsView.module.scss'
import type { ConnectorPartProps } from '../ConnectorsView.types'
import { useConnectorActions } from '../../../../state/connectors.queries'

/**
 * Вход коннектора в подвале окна, слева: войти, войти заново, выйти, отменить идущий вход.
 * Что с входом сейчас (сбой, ждём браузер) - в разделе подключения, здесь только действия.
 * Коннектор без входа в браузере (ключ, команда) - ничего.
 */
export const ConnectorSignIn = ({ connector }: ConnectorPartProps) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const { id, signsIn, signedIn } = connector
  const isSigningIn = connector.status === 'signing-in'

  if (!signsIn) return null

  return (
    <div className={styles.buttons}>
      {isSigningIn && (
        <Button size="sm" onClick={() => actions.cancelSignIn(id)}>
          {t('connectors.actions.cancel')}
        </Button>
      )}
      {!isSigningIn && (
        <Button
          size="sm"
          icon={LogIn}
          variant={signedIn ? 'secondary' : 'primary'}
          onClick={() => actions.signIn(id)}>
          {t(signedIn ? 'connectors.actions.signInAgain' : 'connectors.actions.signIn')}
        </Button>
      )}
      {signedIn && !isSigningIn && (
        <Button size="sm" variant="ghost" icon={LogOut} onClick={() => actions.signOut(id)}>
          {t('connectors.actions.signOut')}
        </Button>
      )}
    </div>
  )
}
