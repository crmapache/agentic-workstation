import clsx from 'clsx'

import styles from './ChartTip.module.scss'
import type { ChartTipProps } from './ChartTip.types'

/**
 * Подсказка у метки графика (столбец, день календаря): о чём шаг и числа каждого ряда -
 * число главное, подпись тише, короткая черта тона говорит, чей ряд. Стеклянная, как
 * Tooltip, но без задержки и одна на график - её водит useChartTip. Для скринридера
 * молчит: числа графика ему читает таблица рядом.
 */
export const ChartTip = ({ tipRef, title, rows, note }: ChartTipProps) => (
  <span ref={tipRef} popover="hint" aria-hidden className={styles.chartTip}>
    <span className={styles.title}>{title}</span>
    {rows.map((row) => (
      <span key={row.key} className={styles.row}>
        {row.tone && <span className={clsx(styles.key, styles[row.tone])} />}
        <span className={styles.value}>{row.value}</span>
        {row.label && <span className={styles.label}>{row.label}</span>}
      </span>
    ))}
    {note && <span className={styles.note}>{note}</span>}
  </span>
)
