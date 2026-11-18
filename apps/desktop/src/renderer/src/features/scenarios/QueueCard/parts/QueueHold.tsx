import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { useOpenRun } from '../QueueCard.hooks'
import styles from '../QueueCard.module.scss'
import type { QueueHoldProps } from '../QueueCard.types'
import { holdWords, holdItemOf, isUnfinished, waitingItems } from '../../scenarios-queues.utils'
import { useScenarioActions } from '../../scenarios.actions'

/**
 * Очередь встала - почему и что дальше. Пустить её может только человек. Встала на несделанном
 * (упал, остановлен, оборван выходом IDE) - мимо него очередь не идёт (ADR 0082): главная кнопка
 * продолжает его прогон с карточки, где он встал, рядом «Open run» - что там было - и «Mark
 * done»: работу доделали руками. Иначе Resume снимает остановку и берёт следующий; ждущих нет -
 * та же кнопка просто убирает полосу (Dismiss).
 */
export const QueueHold = ({ queue, hold }: QueueHoldProps) => {
  const { t } = useTranslation()
  const actions = useScenarioActions()
  const openRun = useOpenRun(queue.id)
  const item = holdItemOf(queue)
  const name = item?.scenarioName ?? t('scenarios.queues.hold.someone')
  const isDanger = hold.reason === 'failed' || hold.reason === 'refused'
  const isCut = hold.reason === 'failed' || hold.reason === 'interrupted'
  const canOpen = Boolean(item?.runId) && isCut
  const canMarkDone = isCut && isUnfinished(item)
  const canGoOn = waitingItems(queue).length > 0
  // Resume над несделанным главный процесс понимает как «продолжить его прогон» - так и сказано.
  const isCarryOn = canGoOn && isUnfinished(item)
  const goOn = isCarryOn ? 'carryOn' : canGoOn ? 'resume' : 'dismiss'
  const why = t(`scenarios.codes.${item?.refusal ?? 'unknown'}`, {
    defaultValue: t('scenarios.codes.unknown'),
  })

  const handleResume = () => void actions.queue(queue.id, { kind: 'resume' })

  const handleMarkDone = () => {
    if (item) void actions.queue(queue.id, { kind: 'markDone', itemId: item.id })
  }

  const handleOpen = () => {
    if (item?.runId) openRun(item.runId)
  }

  return (
    <div role="status" className={clsx(styles.hold, isDanger && styles.holdDanger)}>
      <span className={styles.holdText}>
        {t(`scenarios.queues.hold.${holdWords(hold, item)}`, { name, why })}
      </span>
      <span className={styles.holdActions}>
        {canOpen && (
          <Button size="sm" variant="ghost" onClick={handleOpen}>
            {t('scenarios.queues.hold.openRun')}
          </Button>
        )}
        {canMarkDone && (
          <Button size="sm" variant="ghost" onClick={handleMarkDone}>
            {t('scenarios.queues.hold.markDone')}
          </Button>
        )}
        <Button size="sm" variant={canGoOn ? 'primary' : 'secondary'} onClick={handleResume}>
          {t(`scenarios.queues.hold.${goOn}`)}
        </Button>
      </span>
    </div>
  )
}
