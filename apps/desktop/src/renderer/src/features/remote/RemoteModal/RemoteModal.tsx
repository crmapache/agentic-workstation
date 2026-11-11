import { Smartphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Card } from '@agentic-workstation/ui/Card'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Switch } from '@agentic-workstation/ui/Switch'

import { useRemote, useRemoteActions } from '../remote.queries'
import { useRemoteStore } from '../remote.store'
import { LINK_TONES } from './RemoteModal.constants'
import styles from './RemoteModal.module.scss'
import { PairingPanel } from './parts/PairingPanel'
import { PhoneList } from './parts/PhoneList'

/**
 * Окно Remote Control (ADR 0041): в шапке - состояние связи, переключатель и «?» с тем, что
 * может телефон; ниже - почему связи нет, если это решает человек (адрес занят другим Mac),
 * отпечаток этой IDE, пара по QR (код, ждущий телефон с Approve и Refuse) и спаренные телефоны
 * с отзывом - каждое своей карточкой: подписи разделов над голым текстом сливались в одно.
 * Открывают кнопка в строке состояния и поиск везде.
 */
export const RemoteModal = () => {
  const { t } = useTranslation()
  const isOpen = useRemoteStore((state) => state.isOpen)
  const close = useRemoteStore((state) => state.close)
  const { data: view } = useRemote()
  const { setEnabled } = useRemoteActions()

  if (!view) return null

  return (
    <Modal
      open={isOpen}
      icon={Smartphone}
      iconTone={LINK_TONES[view.state]}
      title={t('remote.title')}
      description={view.enabled ? t('remote.relay') : t('remote.offHint')}
      headerActions={
        <>
          <Badge tone={LINK_TONES[view.state]}>{t(`remote.state.${view.state}`)}</Badge>
          <Switch
            label={t('remote.enabled')}
            labelHidden
            checked={view.enabled}
            onChange={setEnabled}
          />
          <HelpButton
            label={t('remote.help.label')}
            title={t('remote.help.title')}
            text={t('remote.help.text')}
            closeLabel={t('remote.close')}
          />
        </>
      }
      closeLabel={t('remote.close')}
      onClose={close}>
      <div className={styles.layout}>
        {view.state === 'displaced' && (
          <p className={styles.warning}>{t('remote.displacedHint')}</p>
        )}
        {!view.keysKept && <p className={styles.warning}>{t('remote.keysNotKept')}</p>}
        {view.fingerprint && (
          <Card title={t('remote.thisIde')} description={t('remote.fingerprintNote')}>
            <div className={styles.identity}>
              <code className={styles.fingerprint}>{view.fingerprint}</code>
              {/* Адрес релея - здесь, а не в шапке: там он резался многоточием. */}
              <span className={styles.relay}>
                {t('remote.relayLabel')} <span className={styles.relayHost}>{view.relayHost}</span>
              </span>
            </div>
          </Card>
        )}
        <PairingPanel view={view} />
        <PhoneList devices={view.devices} />
      </div>
    </Modal>
  )
}
