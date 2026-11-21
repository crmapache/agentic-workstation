import { useTranslation } from 'react-i18next'

import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Switch } from '@agentic-workstation/ui/Switch'

import { useCloudActions } from '../cloud.actions'
import { useTrackerStore } from '../tracker.store'
import { useCloudState } from '../../../state/tracker.queries'
import styles from './CloudModal.module.scss'
import { cloudIcon } from './CloudModal.utils'
import { AccountKey } from './parts/AccountKey'
import { CloudStatusLine } from './parts/CloudStatusLine'
import { UseKeyForm } from './parts/UseKeyForm'

/**
 * Облако трекера: состояние, ключ аккаунта (показывает главный процесс - окно ключа не видит) или
 * новый аккаунт, если ключ пропал, выключатель синхронизации и чужой ключ для второго компьютера.
 * Как это устроено - за «?».
 */
export const CloudModal = () => {
  const { t } = useTranslation()
  const { data: cloud } = useCloudState()
  const open = useTrackerStore((state) => state.open)
  const { setEnabled } = useCloudActions()

  const handleClose = () => open(null)

  if (!cloud) return null

  return (
    <Modal
      open
      icon={cloudIcon(cloud.status)}
      title={t('tracker.cloud.title')}
      closeLabel={t('common.close')}
      onClose={handleClose}
      headerActions={
        <HelpButton
          label={t('tracker.cloud.help.label')}
          title={t('tracker.cloud.help.title')}
          text={t('tracker.cloud.help.text')}
          closeLabel={t('common.close')}
        />
      }>
      <div className={styles.body}>
        <CloudStatusLine cloud={cloud} />
        <AccountKey cloud={cloud} />
        <Switch
          label={t('tracker.cloud.enabled')}
          description={t('tracker.cloud.enabledHint')}
          checked={cloud.status !== 'off'}
          onChange={(enabled) => void setEnabled(enabled)}
        />
        <UseKeyForm />
      </div>
    </Modal>
  )
}
