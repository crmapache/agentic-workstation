import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

import styles from '../QueueCard.module.scss'
import type { StopRunDialogProps } from '../QueueCard.types'
import { useScenarioActions } from '../../scenarios.actions'

/**
 * «Stop X?» перед тем, как оборвать идущий сценарий. Оборванный считается несделанным, и очередь
 * встаёт на нём сама (ADR 0082): после него ничего не стартует, пока его не продолжат с места или
 * не пометят выполненным, - спрашивать «держать ли очередь» незачем.
 */
export const StopRunDialog = ({ queue, item, runId, onClose }: StopRunDialogProps) => {
  const { t } = useTranslation()
  const actions = useScenarioActions()

  const handleSubmit = () => {
    onClose()
    void actions.control({ queueId: queue.id }, runId, 'stop')
  }

  return (
    <Dialog
      open
      title={t('scenarios.queues.stopDialog.title', { name: item.scenarioName })}
      onSubmit={handleSubmit}
      onClose={onClose}
      actions={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="danger">
            {t('scenarios.queues.stopDialog.confirm')}
          </Button>
        </>
      }>
      <div className={styles.dialogText}>
        <span>{t('scenarios.queues.stopDialog.text')}</span>
      </div>
    </Dialog>
  )
}
