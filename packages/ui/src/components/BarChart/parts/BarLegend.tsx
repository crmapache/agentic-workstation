import clsx from 'clsx'

import styles from '../BarChart.module.scss'
import type { BarLegendProps } from '../BarChart.types'

/**
 * Легенда рядов над графиком: квадратик тона, как сам столбец, и имя ряда. У двух рядов
 * и больше она есть всегда - чей столбец, не угадывают по цвету. Имя - цветом текста, а не
 * ряда: светлый тон буквами не читается.
 */
export const BarLegend = ({ series }: BarLegendProps) => (
  <ul className={styles.legend}>
    {series.map((item) => (
      <li key={item.key} className={styles.legendItem}>
        <span className={clsx(styles.swatch, styles[item.tone])} />
        {item.label}
      </li>
    ))}
  </ul>
)
