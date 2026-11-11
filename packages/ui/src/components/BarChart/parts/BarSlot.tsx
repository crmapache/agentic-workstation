import clsx from 'clsx'

import styles from '../BarChart.module.scss'
import type { BarSlotProps } from '../BarChart.types'
import { heightOf } from '../BarChart.utils'

/**
 * Шаг графика: колонка во всю высоту поля - она и цель указателя (шире самого столбца), в
 * ней столбцы рядов рядом. Рекорд ряда - полным тоном, остальные тише; над самым высоким
 * столбцом графика - его число.
 */
export const BarSlot = ({
  index,
  point,
  series,
  top,
  maxima,
  tallest,
  active,
  formatValue,
}: BarSlotProps) => (
  <span data-mark={index} className={clsx(styles.slot, active && styles.active)}>
    <span className={styles.group}>
      {series.map((item, seriesIndex) => {
        const value = point.values[seriesIndex] ?? 0
        const isTallest = tallest?.point === index && tallest.series === seriesIndex

        return (
          <span
            key={item.key}
            className={clsx(
              styles.bar,
              styles[item.tone],
              value > 0 && styles.filled,
              value > 0 && value === maxima[seriesIndex] && styles.peak,
            )}
            // eslint-disable-next-line no-restricted-syntax -- высота столбца - само число шага
            style={{ height: heightOf(value, top) }}>
            {isTallest && <span className={styles.peakValue}>{formatValue(value)}</span>}
          </span>
        )
      })}
    </span>
  </span>
)
