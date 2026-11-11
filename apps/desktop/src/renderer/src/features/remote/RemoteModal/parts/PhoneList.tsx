import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../RemoteModal.module.scss'
import type { PhoneListProps } from '../RemoteModal.types'
import { seenAt } from '../RemoteModal.utils'
import { useRemoteActions } from '../../remote.queries'

/**
 * Спаренные телефоны: имя (его назвал сам телефон), отпечаток, на связи ли, включены ли на нём
 * уведомления (прислал подписку на пуши), и отзыв.
 */
export const PhoneList = ({ devices }: PhoneListProps) => {
  const { t, i18n } = useTranslation()
  const { revoke } = useRemoteActions()

  return (
    <Section
      size="sm"
      title={t('remote.phones.title')}
      count={devices.length}
      description={devices.length === 0 ? t('remote.phones.empty') : undefined}>
      {devices.length > 0 && (
        <ul className={styles.phones}>
          {devices.map((device) => (
            <li key={device.id} className={styles.phone}>
              <div className={styles.phoneText}>
                <span className={styles.phoneName}>{device.label}</span>
                <span className={styles.phoneMeta}>
                  {device.lastSeenAt > 0
                    ? t('remote.phones.seen', {
                        fingerprint: device.fingerprint,
                        when: seenAt(device.lastSeenAt, i18n.language),
                      })
                    : device.fingerprint}
                </span>
              </div>
              {device.notifications && (
                <Badge tone="info">{t('remote.phones.notifications')}</Badge>
              )}
              {device.online && <Badge tone="success">{t('remote.phones.online')}</Badge>}
              <Button
                variant="danger"
                size="sm"
                aria-label={t('remote.phones.revokeLabel', { label: device.label })}
                onClick={() => revoke(device.id)}>
                {t('remote.phones.revoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
