import clsx from 'clsx'

import styles from '../NoticeRow.module.scss'
import type { LabelRowProps } from '../NoticeRow.types'

/**
 * Служебная строка ACC: подпись капсом (CONTEXT, RETRY, MODEL, SESSION…), текст, справа -
 * время или кнопка. Идущая - подпись «дышит».
 */
export const LabelRow = ({ label, pending, tone = 'neutral', aside, children }: LabelRowProps) => (
  <div role="status" className={clsx(styles.labelRow, styles[tone])}>
    <span className={clsx(styles.label, pending && styles.pending)}>{label}</span>
    <span className={styles.text}>{children}</span>
    <span className={styles.spacer} />
    {aside}
  </div>
)
