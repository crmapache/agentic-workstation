import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import { Switch } from '@agentic-workstation/ui/Switch'

import styles from '../QueueCard.module.scss'
import type { StopRunDialogProps } from '../QueueCard.types'
import { waitingItems } from '../../scenarios-queues.utils'
import { useScenarioActions } from '../../scenarios.actions'

/**
 * «Stop X?» перед тем, как оборвать идущий сценарий. Оборванный считается не доделанным, и
 * следующий без «после успеха» стартовал бы сразу - поэтому, если за ним кто-то ждёт, рядом
 * «держать очередь после него» (включено): остановка после этого элемента ставится до обрыва.
 */
export const StopRunDialog = ({ queue, item, runId, onClose }: StopRunDialogProps) => {
  const { t } = useTranslation()
  const actions = useScenarioActions()
  const [isHolding, setIsHolding] = useState(true)
  // Уже стоит «остановить после текущего» - очередь и так встанет, спрашивать нечего.
  const canHold = waitingItems(queue).length > 0 && queue.stopAfterItemId !== item.id

  const handleSubmit = async () => {
    onClose()

    if (canHold && isHolding) {
      const isMarked = await actions.queue(queue.id, { kind: 'stopAfter', itemId: item.id })

      // Не встала остановка - не обрывать: следующий стартовал бы вопреки выбору.
      if (!isMarked) return
    }

    await actions.control({ queueId: queue.id }, runId, 'stop')
  }

  return (
    <Dialog
      open
      title={t('scenarios.queues.stopDialog.title', { name: item.scenarioName })}
      onSubmit={() => void handleSubmit()}
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
        {canHold && (
          <Switch
            label={t('scenarios.queues.stopDialog.hold')}
            description={t('scenarios.queues.stopDialog.holdNote')}
            checked={isHolding}
            onChange={setIsHolding}
          />
        )}
      </div>
    </Dialog>
  )
}
