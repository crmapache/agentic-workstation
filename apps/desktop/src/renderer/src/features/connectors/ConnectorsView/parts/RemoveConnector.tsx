import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../ConnectorsView.module.scss'
import type { ConnectorPartProps } from '../ConnectorsView.types'
import { connectorTitle } from '../ConnectorsView.utils'
import { useConnectorsStore } from '../../connectors.store'
import { useConnectorActions } from '../../../../state/connectors.queries'

/**
 * Удаление в подвале окна, справа - подальше от входа слева, с подтверждением на месте: вход
 * стирается из IDE, а случайное нажатие стоило бы нового входа. Вопрос и ответы встают там же.
 */
export const RemoveConnector = ({ connector }: ConnectorPartProps) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const close = useConnectorsStore((store) => store.close)
  const [isConfirming, setIsConfirming] = useState(false)

  const handleRemove = () => {
    close()
    actions.remove(connector.id)
  }

  if (!isConfirming) {
    return (
      <div className={styles.footerEnd}>
        <Button size="sm" variant="danger" icon={Trash2} onClick={() => setIsConfirming(true)}>
          {t('connectors.remove.button')}
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.footerEnd}>
      <p className={styles.question}>
        {t('connectors.remove.question', {
          name: connectorTitle(connector, t(`connectors.kinds.${connector.kind}.short`)),
        })}
      </p>
      <div className={styles.buttons}>
        <Button size="sm" variant="ghost" onClick={() => setIsConfirming(false)}>
          {t('connectors.remove.cancel')}
        </Button>
        <Button size="sm" variant="danger" icon={Trash2} onClick={handleRemove}>
          {t('connectors.remove.confirm')}
        </Button>
      </div>
    </div>
  )
}
