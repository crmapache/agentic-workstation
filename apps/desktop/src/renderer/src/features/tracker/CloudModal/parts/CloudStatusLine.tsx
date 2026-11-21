import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'

import styles from '../CloudModal.module.scss'
import type { CloudStatusLineProps } from '../CloudModal.types'
import { clockLabel } from '../../../../lib/dates.utils'

/** Состояние облака строкой: метка, аккаунт, последняя синхронизация, что ждёт и почему не работает. */
export const CloudStatusLine = ({ cloud }: CloudStatusLineProps) => {
  const { t } = useTranslation()
  const tone =
    cloud.status === 'synced'
      ? 'success'
      : cloud.status === 'error'
        ? 'danger'
        : cloud.status === 'offline'
          ? 'warning'
          : 'neutral'

  return (
    <div className={styles.status}>
      <div className={styles.facts}>
        <Badge tone={tone} variant="soft">
          {t(`tracker.cloud.status.${cloud.status}`)}
        </Badge>
        {cloud.accountId && (
          <span className={styles.fact}>
            {t('tracker.cloud.account')} <code className={styles.account}>{cloud.accountId}</code>
          </span>
        )}
        {cloud.lastSyncAt !== null && (
          <span className={styles.fact}>
            {t('tracker.cloud.lastSync', { when: clockLabel(cloud.lastSyncAt) })}
          </span>
        )}
        {cloud.pending > 0 && (
          <span className={styles.fact}>
            {t('tracker.cloud.pending', { count: cloud.pending })}
          </span>
        )}
      </div>
      {cloud.failure && (
        <p className={styles.failure}>{t(`tracker.cloud.failure.${cloud.failure}`)}</p>
      )}
    </div>
  )
}
