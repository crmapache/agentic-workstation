import { Fragment } from 'react'
import clsx from 'clsx'

import styles from '../Tooltip.module.scss'
import type { TooltipDetailsBodyProps } from '../Tooltip.types'

/**
 * Содержимое справки: заголовок капсом и главное число цветом ступени, под линией - строки
 * тремя колонками: подписи по левому краю, числа моноширинным по правому, уточнения тише за
 * ними - числа встают под числами, даже когда уточнение есть не у всех. Внизу заметка.
 */
export const TooltipDetailsBody = ({ title, details }: TooltipDetailsBodyProps) => (
  <>
    <span className={styles.head}>
      <span className={styles.title}>{title}</span>
      {details.value && (
        <span className={clsx(styles.headValue, details.tone && styles[details.tone])}>
          {details.value}
        </span>
      )}
    </span>
    {details.rows.length > 0 && (
      <span className={styles.rows}>
        {details.rows.map((row) => (
          <Fragment key={row.key}>
            <span className={styles.rowLabel}>{row.label}</span>
            <span className={clsx(styles.rowValue, row.tone && styles[row.tone])}>{row.value}</span>
            <span className={styles.aside}>{row.aside}</span>
          </Fragment>
        ))}
      </span>
    )}
    {details.note && <span className={styles.note}>{details.note}</span>}
  </>
)
