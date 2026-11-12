import clsx from 'clsx'

import styles from '../ChartTip.module.scss'
import type { ChartLegendProps } from '../ChartTip.types'

/**
 * Легенда рядов - общая часть графиков (BarChart над столбцами, ShareBar под полосой), а не
 * отдельный примитив: сама по себе она ничего не значит. Квадратик тона, как сама метка, имя
 * цветом текста, а не ряда (светлый тон буквами не читается), и, если дали, число куска справа.
 */
export const ChartLegend = ({ items }: ChartLegendProps) => (
  <ul className={styles.legend}>
    {items.map((item) => (
      <li key={item.key} className={styles.legendItem}>
        <span className={clsx(styles.swatch, styles[item.tone])} />
        {item.label}
        {item.valueLabel && <span className={styles.legendValue}>{item.valueLabel}</span>}
      </li>
    ))}
  </ul>
)
