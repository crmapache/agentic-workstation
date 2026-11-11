import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'

import styles from '../RemoteModal.module.scss'
import type { PendingPhoneProps } from '../RemoteModal.types'
import { useRemoteActions } from '../../remote.queries'

/**
 * Телефон доказал, что видел код, и ждёт «да». Доказательства мало против того, кто
 * сфотографировал экран и отсканировал первым: это ловит сверка отпечатка глазами.
 */
export const PendingPhone = ({ pending }: PendingPhoneProps) => {
  const { t } = useTranslation()
  const { approve, refuse } = useRemoteActions()

  return (
    <Card tone="accent" title={t('remote.pending.title', { label: pending.label })}>
      <div className={styles.pending}>
        <p className={styles.hint}>{t('remote.pending.check')}</p>
        <code className={styles.fingerprint}>{pending.fingerprint}</code>
        <div className={styles.buttons}>
          <Button variant="primary" onClick={approve}>
            {t('remote.pending.approve')}
          </Button>
          <Button variant="secondary" onClick={refuse}>
            {t('remote.pending.refuse')}
          </Button>
        </div>
      </div>
    </Card>
  )
}
