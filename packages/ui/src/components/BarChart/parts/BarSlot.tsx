import clsx from 'clsx'

import styles from '../BarChart.module.scss'
import type { BarSlotProps } from '../BarChart.types'
import { heightOf, segmentsOf } from '../BarChart.utils'

/**
 * Шаг графика: колонка во всю высоту поля - она и цель указателя, в ней метки рядов во всю
 * её ширину - рядом, стопкой или меньший снизу, а из него растёт больший. Рекорд ряда -
 * полным тоном, остальные тише; над самым высоким столбцом графика - его число. Шаг
 * выходного дня - на подложке, первый шаг суток - за линией.
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
  layout,
}: BarSlotProps) => {
  const segments = segmentsOf(point, layout)

  return (
    <span
      data-mark={index}
      className={clsx(
        styles.slot,
        active && styles.active,
        point.shaded && styles.shaded,
        point.boundary && styles.boundary,
      )}>
      <span className={clsx(styles.group, styles[layout])}>
        {segments.map(({ series: seriesIndex, value, height }) => {
          const isTallest = tallest?.point === index && tallest.series === seriesIndex

          return (
            <span
              key={series[seriesIndex]?.key ?? seriesIndex}
              className={clsx(
                styles.bar,
                styles[series[seriesIndex]?.tone ?? 'other'],
                value > 0 && styles.filled,
                value > 0 && value === maxima[seriesIndex] && styles.peak,
              )}
              // eslint-disable-next-line no-restricted-syntax -- высота метки - само число шага
              style={{ height: heightOf(height, top) }}>
              {isTallest && <span className={styles.peakValue}>{formatValue(tallest.value)}</span>}
            </span>
          )
        })}
      </span>
    </span>
  )
}
