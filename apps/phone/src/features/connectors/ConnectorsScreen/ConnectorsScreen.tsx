import { Unplug } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import type { RouteOf } from '../../../lib/route.types'
import { failureText } from '../../../state/commands.utils'
import { LinkWait } from '../../../shell/LinkWait/LinkWait'
import { Screen } from '../../../shell/Screen/Screen'
import { useConnectorsScreen } from './ConnectorsScreen.hooks'
import styles from './ConnectorsScreen.module.scss'
import { ConnectorCard } from './parts/ConnectorCard'

/**
 * Коннекторы IDE к приложениям: в каком они состоянии и переподключить. Добавить, убрать и войти
 * (вход - браузером на Mac) - за компьютером.
 */
export const ConnectorsScreen = ({ route }: { route: RouteOf<'connectors'> }) => {
  const { t } = useTranslation()
  const screen = useConnectorsScreen(route)
  const { connectors } = screen

  return (
    <Screen
      title={t('connectors.title')}
      subtitle={screen.machine}
      agentId={route.agentId}
      help={{ title: t('connectors.help.title'), text: t('connectors.help.text') }}>
      {connectors.isPending && <LinkWait agentId={route.agentId} label={t('connectors.loading')} />}
      {connectors.isError && (
        <div className={styles.failed}>
          <p className={styles.error}>{failureText(t, connectors.error)}</p>
          <Button size="touch" onClick={() => void connectors.refetch()}>
            {t('history.retry')}
          </Button>
        </div>
      )}
      {connectors.data?.connectors.length === 0 && (
        <EmptyState icon={Unplug} title={t('connectors.none')} />
      )}
      {connectors.data?.connectors.map((connector) => (
        <ConnectorCard
          key={connector.id}
          connector={connector}
          reconnecting={screen.reconnecting === connector.id}
          onReconnect={screen.handleReconnect}
        />
      ))}
    </Screen>
  )
}
