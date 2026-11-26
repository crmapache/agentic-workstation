import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

import styles from '../QueueCard.module.scss'
import type { AlongsideDialogProps } from '../QueueCard.types'
import { useScenarioActions } from '../../scenarios.actions'
import { queueNames } from '../../../../state/queue-folder.utils'

/**
 * «Run alongside now?» - то же предупреждение про общую папку, что в окне запуска: очередь начнёт
 * сразу рядом с держателями, и обе будут править одни файлы. Ждущие в очереди к папке остаются на
 * своих местах.
 */
export const AlongsideDialog = ({ queue, wait, onClose }: AlongsideDialogProps) => {
  const { t } = useTranslation()
  const actions = useScenarioActions()
  const beside = wait.holders.length > 0 ? wait.holders.map((one) => one.queue) : wait.ahead

  const handleSubmit = () => {
    onClose()
    void actions.queue(queue.id, { kind: 'alongside' })
  }

  return (
    <Dialog
      open
      title={t('scenarios.queues.turn.dialog.title', { name: queue.name })}
      onSubmit={handleSubmit}
      onClose={onClose}
      actions={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {t('scenarios.queues.turn.dialog.confirm')}
          </Button>
        </>
      }>
      <div className={styles.dialogText}>
        <span>{t('scenarios.queues.turn.dialog.text', { names: queueNames(beside) })}</span>
      </div>
    </Dialog>
  )
}
