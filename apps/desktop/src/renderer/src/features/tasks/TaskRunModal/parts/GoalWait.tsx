import { useTranslation } from 'react-i18next'

import styles from '../TaskRunModal.module.scss'
import type { GoalPartProps } from '../TaskRunModal.types'
import { useTaskWords } from '../../tasks.hooks'

/**
 * Чего поручение ждёт во сне: причина словами модели, ответ человека, срок пробуждения и
 * сторожа - что читают, как часто, когда следующая проверка и не ломаются ли они. Работает -
 * так и сказано.
 */
export const GoalWait = ({ life, now }: GoalPartProps) => {
  const { t } = useTranslation()
  const words = useTaskWords()
  const { wait } = life

  if (!wait) return <div className={styles.text}>{t('tasks.goal.working')}</div>

  return (
    <div className={styles.block}>
      <span className={styles.caption}>{t('tasks.goal.waitingFor')}</span>
      <span className={styles.reason}>{wait.reason}</span>
      {wait.person && <span className={styles.text}>{t('tasks.goal.person')}</span>}
      {wait.until > 0 && (
        <span className={styles.text}>
          {t('tasks.goal.until', { when: words.moment(wait.until, now) })}
        </span>
      )}
      {wait.watches.map((watch) => (
        <span key={watch.id} className={styles.text}>
          {[
            watch.kind === 'tool'
              ? t('tasks.goal.tool', {
                  what: `${watch.server} ${watch.tool}`,
                  every: watch.everyMin,
                })
              : t('tasks.goal.look', { what: watch.instructions }),
            t('tasks.goal.next', { when: words.moment(watch.nextAt, now) }),
            watch.failures > 0 ? t('tasks.goal.failing', { error: watch.lastError }) : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      ))}
    </div>
  )
}
