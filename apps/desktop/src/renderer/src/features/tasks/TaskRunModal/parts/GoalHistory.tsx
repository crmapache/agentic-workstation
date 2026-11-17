import { useTranslation } from 'react-i18next'

import { HISTORY_SHOWN } from '../TaskRunModal.constants'
import styles from '../TaskRunModal.module.scss'
import type { GoalPartProps } from '../TaskRunModal.types'
import { useTaskWords } from '../../tasks.hooks'

/**
 * История поручения - свежее сверху: заснуло, проверило, проснулось, спросило об отправке. У
 * проверки дешёвой моделью - её цена.
 */
export const GoalHistory = ({ life, now }: GoalPartProps) => {
  const { t } = useTranslation()
  const words = useTaskWords()
  const events = life.events.slice(-HISTORY_SHOWN).reverse()

  return (
    <div className={styles.block}>
      <span className={styles.caption}>{t('tasks.goal.history')}</span>
      {events.map((event, index) => (
        <div key={`${event.at}-${index}`} className={styles.event}>
          <span className={styles.eventWhen}>{words.moment(event.at, now)}</span>
          <span className={styles.text}>
            {[
              t(`tasks.goal.events.${event.kind}`),
              event.text,
              event.costUsd > 0 ? `$${event.costUsd.toFixed(3)}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      ))}
    </div>
  )
}
