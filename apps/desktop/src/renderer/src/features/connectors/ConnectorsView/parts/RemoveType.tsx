import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../ConnectorsView.module.scss'
import type { TypePartProps } from '../ConnectorsView.types'
import { useConnectorsStore } from '../../connectors.store'
import { useConnectorActions } from '../../../../state/connectors.queries'

/**
 * Удаление своего типа из каталога, в подвале окна справа, с подтверждением на месте: вместе
 * с ним уходят его подключения и их входы. Встроенные (Gmail, Notion) так не удаляются.
 */
export const RemoveType = ({ type, connections }: TypePartProps) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const close = useConnectorsStore((store) => store.close)
  const [isConfirming, setIsConfirming] = useState(false)

  const handleRemove = () => {
    close()
    actions.removeType(type.id)
  }

  if (!isConfirming) {
    return (
      <div className={styles.footerEnd}>
        <Button size="sm" variant="danger" icon={Trash2} onClick={() => setIsConfirming(true)}>
          {t('connectors.types.remove')}
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.footerEnd}>
      <p className={styles.question}>
        {connections
          ? t('connectors.types.question', { name: type.name, count: connections })
          : t('connectors.types.questionEmpty', { name: type.name })}
      </p>
      <div className={styles.buttons}>
        <Button size="sm" variant="ghost" onClick={() => setIsConfirming(false)}>
          {t('connectors.types.cancel')}
        </Button>
        <Button size="sm" variant="danger" icon={Trash2} onClick={handleRemove}>
          {t('connectors.types.confirm')}
        </Button>
      </div>
    </div>
  )
}
