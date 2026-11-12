import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ConnectorWire } from '@agentic-workstation/remote-protocol/machine-wire-types'
import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'

import { CONNECTOR_TONES } from '../ConnectorsScreen.constants'
import styles from '../ConnectorsScreen.module.scss'
import { connectorName, connectorFacts } from '../ConnectorsScreen.utils'

/**
 * Коннектор карточкой: имя, подпись и чей вход, состояние (и почему сбой), сколько
 * инструментов включено, «переподключить» - перечитать инструменты у сервиса.
 */
export const ConnectorCard = ({
  connector,
  reconnecting,
  onReconnect,
}: {
  connector: ConnectorWire
  reconnecting: boolean
  onReconnect: (connectorId: string) => void
}) => {
  const { t } = useTranslation()

  return (
    <Card
      title={connectorName(t, connector)}
      description={connectorFacts(connector) || undefined}
      actions={
        <Badge tone={CONNECTOR_TONES[connector.status] ?? 'neutral'}>
          {t(`connectors.status.${connector.status}`, { defaultValue: connector.status })}
        </Badge>
      }>
      <div className={styles.body}>
        {connector.failure && <p className={styles.error}>{connector.failure}</p>}
        <p className={styles.note}>
          {t('connectors.tools', { on: connector.toolsOn, count: connector.tools })}
        </p>
        <Button
          size="touch"
          icon={RefreshCw}
          disabled={reconnecting}
          onClick={() => onReconnect(connector.id)}>
          {t('connectors.reconnect')}
        </Button>
      </div>
    </Card>
  )
}
