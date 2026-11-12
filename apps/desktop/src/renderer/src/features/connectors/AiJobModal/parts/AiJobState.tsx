import { useTranslation } from 'react-i18next'

import { Spinner } from '@agentic-workstation/ui/Spinner'

import styles from '../AiJobModal.module.scss'
import type { AiJobPartProps } from '../AiJobModal.types'
import { failureLine, activityLine } from '../../ai-job.utils'

/**
 * Строка под разговором: что ИИ делает прямо сейчас (ищет, читает страницу, пишет ответ),
 * почему ход сломался и что делать, или что он остановлен. Вне хода без сбоя - ничего: ответ
 * ИИ уже стоит в разговоре. Слова CLI об ошибке лента показывает сама; здесь подробности
 * только у непрошедшей проверки - их в ленте нет.
 */
export const AiJobState = ({ job }: AiJobPartProps) => {
  const { t } = useTranslation()

  if (job.status === 'working') {
    return (
      <div className={styles.state}>
        <Spinner size="sm" tone="accent" />
        <span className={styles.activity}>{activityLine(t, job.activity)}</span>
      </div>
    )
  }

  if (job.status === 'failed') {
    return (
      <p className={styles.failure}>
        {failureLine(t, job)}
        {job.error === 'invalid' && job.detail && (
          <span className={styles.detail}>{job.detail}</span>
        )}
      </p>
    )
  }

  return job.status === 'stopped' ? (
    <p className={styles.note}>{t('connectors.ai.stopped')}</p>
  ) : null
}
