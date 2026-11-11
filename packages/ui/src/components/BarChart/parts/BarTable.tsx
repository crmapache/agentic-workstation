import styles from '../BarChart.module.scss'
import type { BarTableProps } from '../BarChart.types'

/**
 * Числа графика таблицей - для скринридера: сам график для него картинка с подписью, а
 * подсказка у столбцов молчит. Глазу не видна.
 */
export const BarTable = ({ label, series, points, formatValue }: BarTableProps) => (
  <table className={styles.table}>
    <caption>{label}</caption>
    <thead>
      <tr>
        <td />
        {series.map((item) => (
          <th key={item.key} scope="col">
            {item.label}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {points.map((point) => (
        <tr key={point.key}>
          <th scope="row">{point.label}</th>
          {series.map((item, index) => (
            <td key={item.key}>{formatValue(point.values[index] ?? 0)}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
)
