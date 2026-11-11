import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { useOpenRun } from '../QueueCard.hooks'
import styles from '../QueueCard.module.scss'
import type { QueueHoldProps } from '../QueueCard.types'
import { holdItemOf, waitingItems } from '../../scenarios-queues.utils'
import { useScenarioActions } from '../../scenarios.actions'

/**
 * Очередь встала - почему и что дальше. Пустить её может только человек: Resume снимает
 * остановку и берёт следующий; ждущих нет - та же кнопка просто убирает полосу (Dismiss).
 * Провал и IDE, закрытая посреди прогона, - ещё и «Open run»: первый вопрос - что там было.
 */
export const QueueHold = ({ queue, hold }: QueueHoldProps) => {
  const { t } = useTranslation()
  const actions = useScenarioActions()
  const openRun = useOpenRun(queue.id)
  const item = holdItemOf(queue)
  const name = item?.scenarioName ?? t('scenarios.queues.hold.someone')
  const isDanger = hold.reason === 'failed' || hold.reason === 'refused'
  const canOpen =
    Boolean(item?.runId) && (hold.reason === 'failed' || hold.reason === 'interrupted')
  const canGoOn = waitingItems(queue).length > 0
  const why = t(`scenarios.codes.${item?.refusal ?? 'unknown'}`, {
    defaultValue: t('scenarios.codes.unknown'),
  })

  const handleResume = () => void actions.queue(queue.id, { kind: 'resume' })

  const handleOpen = () => {
    if (item?.runId) openRun(item.runId)
  }

  return (
    <div role="status" className={clsx(styles.hold, isDanger && styles.holdDanger)}>
      <span className={styles.holdText}>
        {t(`scenarios.queues.hold.${hold.reason}`, { name, why })}
      </span>
      <span className={styles.holdActions}>
        {canOpen && (
          <Button size="sm" variant="ghost" onClick={handleOpen}>
            {t('scenarios.queues.hold.openRun')}
          </Button>
        )}
        <Button size="sm" variant={canGoOn ? 'primary' : 'secondary'} onClick={handleResume}>
          {canGoOn ? t('scenarios.queues.hold.resume') : t('scenarios.queues.hold.dismiss')}
        </Button>
      </span>
    </div>
  )
}
