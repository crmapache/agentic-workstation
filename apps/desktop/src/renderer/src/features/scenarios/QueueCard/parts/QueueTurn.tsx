import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { useOpenRun } from '../QueueCard.hooks'
import styles from '../QueueCard.module.scss'
import type { QueueTurnProps } from '../QueueCard.types'
import { queueNames } from '../../../../state/queue-folder.utils'
import { AlongsideDialog } from './AlongsideDialog'

/**
 * Очередь ждёт своей очереди к папке проекта (ADR 0128): кого ждёт и сколько очередей впереди.
 * Держатель стоит на недоделанном - что именно стоит и что сделать: сам он папку не отпустит, его
 * прогон продолжают (кнопка открывает его), помечают выполненным или закрывают его очередь.
 * «Run alongside now» - выбор человека не ждать, после вопроса: обе очереди будут править одни файлы.
 */
export const QueueTurn = ({ queue, wait }: QueueTurnProps) => {
  const { t } = useTranslation()
  const [isAsking, setIsAsking] = useState(false)
  const stuck = wait.holders.find((holder) => holder.unfinished !== null) ?? null
  const openRun = useOpenRun(stuck?.queue.id ?? queue.id)
  const names = queueNames(wait.holders.map((holder) => holder.queue))
  const why = stuck?.unfinished
    ? t('scenarios.queues.turn.unfinished', {
        name: stuck.unfinished.scenarioName,
        queue: stuck.queue.name,
      })
    : wait.holders.length > 0
      ? t('scenarios.queues.turn.working', { names })
      : t('scenarios.queues.turn.after', { names: queueNames(wait.ahead) })
  const ahead =
    wait.holders.length > 0 && wait.ahead.length > 0
      ? t('scenarios.queues.turn.ahead', { count: wait.ahead.length })
      : ''

  const handleOpen = () => {
    if (stuck?.unfinished?.runId) openRun(stuck.unfinished.runId)
  }

  const handleAsk = () => setIsAsking(true)

  const handleClose = () => setIsAsking(false)

  return (
    <div role="status" className={styles.hold}>
      <span className={styles.holdText}>{ahead ? `${why} ${ahead}` : why}</span>
      <span className={styles.holdActions}>
        {stuck?.unfinished?.runId && (
          <Button size="sm" variant="ghost" onClick={handleOpen}>
            {t('scenarios.queues.turn.openRun')}
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={handleAsk}>
          {t('scenarios.queues.turn.alongside')}
        </Button>
      </span>
      {isAsking && <AlongsideDialog queue={queue} wait={wait} onClose={handleClose} />}
    </div>
  )
}
