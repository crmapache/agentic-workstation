import { useState } from 'react'
import { Copy, KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { CloudState } from '@shared/tracker'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Switch } from '@agentic-workstation/ui/Switch'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useTrackerStore } from '../tracker.store'
import { invoke } from '../../../lib/ipc'
import { QUERY_KEYS } from '../../../state/query-keys'
import { useCloudState } from '../../../state/tracker.queries'
import styles from './CloudModal.module.scss'
import { cloudIcon } from './CloudModal.utils'
import { CloudStatusLine } from './parts/CloudStatusLine'

/**
 * Облако трекера: состояние, ключ аккаунта (копирует главный процесс - окно ключа не видит),
 * чужой ключ для второго компьютера и выключатель синхронизации. Как это устроено - за «?».
 */
export const CloudModal = () => {
  const { t } = useTranslation()
  const { data: cloud } = useCloudState()
  const queryClient = useQueryClient()
  const open = useTrackerStore((state) => state.open)
  const [key, setKey] = useState('')
  const [badKey, setBadKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const put = (state: CloudState) => queryClient.setQueryData(QUERY_KEYS.cloudState, state)

  const handleClose = () => open(null)
  const handleCopy = async () => {
    put(await invoke('cloud:copyKey'))
    setCopied(true)
  }
  const handleUseKey = async () => {
    const outcome = await invoke('cloud:useKey', { key })

    setBadKey(!outcome.ok)

    if (!outcome.ok) return

    put(outcome.state)
    setKey('')
  }
  const handleEnabled = async (enabled: boolean) =>
    put(await invoke('cloud:setEnabled', { enabled }))

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
        {cloud.accountId && (
          <div className={styles.key}>
            <Button
              variant={cloud.keySaved ? 'secondary' : 'primary'}
              icon={Copy}
              onClick={() => void handleCopy()}>
              {copied ? t('tracker.cloud.copied') : t('tracker.cloud.copyKey')}
            </Button>
            {!cloud.keySaved && <p className={styles.warning}>{t('tracker.cloud.saveKey')}</p>}
          </div>
        )}
        <Switch
          label={t('tracker.cloud.enabled')}
          description={t('tracker.cloud.enabledHint')}
          checked={cloud.status !== 'off'}
          onChange={(enabled) => void handleEnabled(enabled)}
        />
        <form
          className={styles.useKey}
          onSubmit={(event) => {
            event.preventDefault()
            if (key.trim()) void handleUseKey()
          }}>
          <TextField
            label={t('tracker.cloud.useKey')}
            icon={KeyRound}
            placeholder={t('tracker.cloud.keyPlaceholder')}
            value={key}
            error={badKey ? t('tracker.cloud.badKey') : undefined}
            onChange={(value) => {
              setKey(value)
              setBadKey(false)
            }}
          />
          <Button variant="secondary" type="submit" disabled={!key.trim()}>
            {t('tracker.cloud.connect')}
          </Button>
        </form>
      </div>
    </Modal>
  )
}
