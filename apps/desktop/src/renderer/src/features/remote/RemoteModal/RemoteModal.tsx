import { Smartphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Section } from '@agentic-workstation/ui/Section'
import { Switch } from '@agentic-workstation/ui/Switch'

import { useRemote, useRemoteActions } from '../remote.queries'
import { useRemoteStore } from '../remote.store'
import { LINK_TONES } from './RemoteModal.constants'
import styles from './RemoteModal.module.scss'
import { PairingPanel } from './parts/PairingPanel'
import { PhoneList } from './parts/PhoneList'

/**
 * Окно Remote Control (ADR 0041): в шапке - состояние связи, переключатель и «?» с тем, что
 * может телефон; ниже - отпечаток этой IDE, пара по QR (код, ждущий телефон с Approve и Refuse)
 * и спаренные телефоны с отзывом. Открывают кнопка в строке состояния и поиск везде.
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
      description={view.enabled ? t('remote.relay', { host: view.relayHost }) : t('remote.offHint')}
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
        {!view.keysKept && <p className={styles.warning}>{t('remote.keysNotKept')}</p>}
        {view.fingerprint && (
          <Section size="sm" title={t('remote.thisIde')} description={t('remote.fingerprintNote')}>
            <code className={styles.fingerprint}>{view.fingerprint}</code>
          </Section>
        )}
        <PairingPanel view={view} />
        <PhoneList devices={view.devices} />
      </div>
    </Modal>
  )
}
