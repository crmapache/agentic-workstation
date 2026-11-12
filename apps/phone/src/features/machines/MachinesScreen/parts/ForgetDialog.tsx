import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

import styles from '../MachinesScreen.module.scss'
import { useClient } from '../../../../lib/client'
import type { MachineView } from '../../../../state/remote.types'

/** Забыть IDE на телефоне: ключ пары стирается; в IDE телефон отзывают отдельно. */
export const ForgetDialog = ({
  open,
  machine,
  onClose,
}: {
  open: boolean
  machine: MachineView
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const client = useClient()

  const handleForget = () => {
    void client.forget(machine.agentId)
    onClose()
  }

  return (
    <Dialog
      open={open}
      title={t('machines.forgetDialog.title', { label: machine.label })}
      onSubmit={handleForget}
      onClose={onClose}
      actions={
        <>
          <Button size="touch" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="touch" variant="danger" type="submit">
            {t('machines.forget')}
          </Button>
        </>
      }>
      <p className={styles.meta}>{t('machines.forgetDialog.text')}</p>
    </Dialog>
  )
}
