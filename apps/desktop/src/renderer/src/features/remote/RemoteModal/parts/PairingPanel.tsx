import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'

import styles from '../RemoteModal.module.scss'
import type { PairingPanelProps } from '../RemoteModal.types'
import { useRemoteActions } from '../../remote.queries'
import { PairingOffer } from './PairingOffer'
import { PendingPhone } from './PendingPhone'

/**
 * Пара: ждущий телефон важнее всего (Approve или Refuse), иначе код с отсчётом, иначе кнопка
 * нового кода. Связь выключена - пары нет, и окно говорит, что сделать. Своя карточка в окне.
 */
export const PairingPanel = ({ view }: PairingPanelProps) => {
  const { t } = useTranslation()
  const { startPairing } = useRemoteActions()

  return (
    <Card title={t('remote.pair.title')}>
      {!view.enabled ? (
        <p className={styles.hint}>{t('remote.pair.turnOn')}</p>
      ) : view.pending ? (
        <PendingPhone pending={view.pending} />
      ) : view.pairing ? (
        <PairingOffer pairing={view.pairing} />
      ) : (
        <div className={styles.buttons}>
          <Button variant="primary" disabled={view.state !== 'connected'} onClick={startPairing}>
            {t('remote.pair.start')}
          </Button>
        </div>
      )}
    </Card>
  )
}
