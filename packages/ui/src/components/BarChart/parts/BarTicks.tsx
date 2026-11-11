import clsx from 'clsx'

import styles from '../BarChart.module.scss'
import type { BarTicksProps } from '../BarChart.types'

/**
 * Числа шкалы слева, по трём линиям: верх, половина, ноль. Колонка шириной с самое длинное
 * число - график не обрезает «1h 20m» и не держит пустое место под короткие. У пустого
 * графика шкалы нет: «1» и «0.5» там ничего не значили бы.
 */
export const BarTicks = ({ top, empty, formatValue }: BarTicksProps) => (
  <div className={styles.ticks} aria-hidden>
    {!empty && <span className={clsx(styles.tick, styles.tickTop)}>{formatValue(top)}</span>}
    {!empty && <span className={clsx(styles.tick, styles.tickHalf)}>{formatValue(top / 2)}</span>}
    <span className={clsx(styles.tick, styles.tickZero)}>{formatValue(0)}</span>
  </div>
)
