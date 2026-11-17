import { useTranslation } from 'react-i18next'

import { ProgressBar } from '@agentic-workstation/ui/ProgressBar'

import { CLOCK_SECOND_MS } from '../TaskModal.constants'
import styles from '../TaskModal.module.scss'
import type { AuthorWaitProps } from '../TaskModal.types'
import { waitClock } from '../../../../lib/dates.utils'
import { useNow } from '../../../../lib/now.hooks'

/**
 * ИИ пишет задание: полоса без доли и мерцающие слова с часами ожидания. Ответ приходит через
 * десятки секунд, и серая строка без часов была бы неотличима от «ничего не произошло».
 */
export const AuthorWait = ({ since }: AuthorWaitProps) => {
  const { t } = useTranslation()
  const now = useNow(true, CLOCK_SECOND_MS)

  return (
    <div className={styles.wait}>
      <ProgressBar label={t('tasks.form.author.writingLabel')} />
      <span className={styles.waitLine}>
        <span className={styles.writing}>{t('tasks.form.author.writing')}</span>
        <span className={styles.elapsed}>{waitClock(now - since)}</span>
      </span>
    </div>
  )
}
