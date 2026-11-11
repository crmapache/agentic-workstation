import { useTranslation } from 'react-i18next'

import { ProgressBar } from '@agentic-workstation/ui/ProgressBar'

import styles from '../AuthorModal.module.scss'
import type { DraftWaitProps } from '../AuthorModal.types'
import { useNow } from '../../scenarios-clock.hooks'
import { waitClock } from '../../scenarios-forms.utils'
import { CLOCK_TICK_MS } from '../../scenarios.constants'

/**
 * Модель пишет сценарий: полоса без доли под полем и мерцающие слова с часами ожидания. Нажатие
 * здесь отвечает не сразу, а через минуты, и серая строка была бы неотличима от «ничего не
 * произошло». Часы - рядом со словами: без них десятая секунда и девяностая читаются одинаково.
 */
export const DraftWait = ({ since }: DraftWaitProps) => {
  const { t } = useTranslation()
  const now = useNow(true, CLOCK_TICK_MS)

  return (
    <div className={styles.wait}>
      <ProgressBar label={t('scenarios.author.writingLabel')} />
      <span className={styles.waitLine}>
        <span className={styles.writing}>{t('scenarios.author.writing')}</span>
        <span className={styles.elapsed}>{waitClock(now - since)}</span>
      </span>
    </div>
  )
}
