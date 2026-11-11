import { useTranslation } from 'react-i18next'

import { useClock } from '../QueueCard.hooks'
import styles from '../QueueCard.module.scss'
import type { RunReadingsProps } from '../QueueCard.types'
import { formatCost, formatTokens } from '../../scenarios-format.utils'
import { waitClock } from '../../scenarios-forms.utils'
import { runWorked } from '../../scenarios-timeline.utils'
import { CLOCK_TICK_MS } from '../../scenarios.constants'

/**
 * Показания идущего прогона: сколько он на самом деле работал (пауза и вопрос человеку часы не
 * двигают - на них они и не тикают), токены и деньги, как только появились.
 */
export const RunReadings = ({ live }: RunReadingsProps) => {
  const { t } = useTranslation()
  const now = useClock(live.state === 'running' || live.state === 'starting', CLOCK_TICK_MS)

  return (
    <div className={styles.readings}>
      <span className={styles.reading}>
        <span className={styles.readingKey}>{t('scenarios.queues.running.worked')}</span>
        <span className={styles.readingValue}>{waitClock(runWorked(live, now))}</span>
      </span>
      {live.tokens > 0 && (
        <span className={styles.reading}>
          <span className={styles.readingKey}>{t('scenarios.queues.running.tokens')}</span>
          <span className={styles.readingValue}>{formatTokens(live.tokens)}</span>
        </span>
      )}
      {live.cost > 0 && (
        <span className={styles.reading}>
          <span className={styles.readingKey}>{t('scenarios.queues.running.cost')}</span>
          <span className={styles.readingValue}>{formatCost(live.cost)}</span>
        </span>
      )}
    </div>
  )
}
