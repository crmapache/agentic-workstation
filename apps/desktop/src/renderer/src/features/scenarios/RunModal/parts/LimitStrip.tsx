import { useTranslation } from 'react-i18next'

import styles from '../RunModal.module.scss'
import type { LimitStripProps } from '../RunModal.types'
import { limitWords } from '../../scenarios-run.utils'

/**
 * Строка LIMIT, пока прогон пережидает лимит, которого ни у одного аккаунта нет в запасе: чей,
 * какое окно и когда пойдёт сам. Пауза, которая молчит о себе, читается как забытая. Resume в
 * шапке пробует сейчас, а не в тот час.
 */
export const LimitStrip = ({ limit }: LimitStripProps) => {
  const { t } = useTranslation()

  return (
    <div className={styles.limit}>
      <span className={styles.limitLabel}>{t('scenarios.run.limit.label')}</span>
      <span className={styles.limitText}>{limitWords(t, limit)}</span>
    </div>
  )
}
