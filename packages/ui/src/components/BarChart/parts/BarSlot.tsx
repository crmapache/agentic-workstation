import clsx from 'clsx'

import styles from '../BarChart.module.scss'
import type { BarSlotProps } from '../BarChart.types'
import { shareOf, totalOf } from '../BarChart.utils'

/** Доля шкалы - высотой в процентах поля. */
const percent = (share: number) => `${share * 100}%`

/**
 * Шаг графика: колонка во всю высоту поля - она и цель указателя (шире самого столбца), в
 * ней столбцы рядов рядом или стопкой. Рекорд ряда - полным тоном, остальные тише; над
 * самым высоким столбцом графика - его число.
 */
export const BarSlot = ({
  index,
  point,
  series,
  layout,
  top,
  maxima,
  tallest,
  active,
  formatValue,
}: BarSlotProps) => {
  const isTallest = (seriesIndex: number) =>
    tallest !== null && tallest.point === index && tallest.series === seriesIndex

  if (layout === 'stacked') {
    const total = totalOf(point.values)

    return (
      <span data-mark={index} className={clsx(styles.slot, active && styles.active)}>
        {total > 0 && (
          <span
            className={clsx(styles.stack, total === maxima[0] && styles.peak)}
            // eslint-disable-next-line no-restricted-syntax -- высота стопки - само число шага
            style={{ height: percent(shareOf(total, top)) }}>
            {isTallest(0) && <span className={styles.peakValue}>{formatValue(total)}</span>}
            {series.map(
              (item, seriesIndex) =>
                (point.values[seriesIndex] ?? 0) > 0 && (
                  <span
                    key={item.key}
                    className={clsx(styles.segment, styles[item.tone])}
                    // eslint-disable-next-line no-restricted-syntax -- доля ряда в стопке - его число
                    style={{ flexGrow: point.values[seriesIndex] }}
                  />
                ),
            )}
          </span>
        )}
      </span>
    )
  }

  return (
    <span data-mark={index} className={clsx(styles.slot, active && styles.active)}>
      <span className={styles.group}>
        {series.map((item, seriesIndex) => {
          const value = point.values[seriesIndex] ?? 0

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
              style={{ height: percent(shareOf(value, top)) }}>
              {isTallest(seriesIndex) && (
                <span className={styles.peakValue}>{formatValue(value)}</span>
              )}
            </span>
          )
        })}
      </span>
    </span>
  )
}
