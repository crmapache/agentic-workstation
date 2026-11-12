import styles from '../StatisticsView.module.scss'
import type { FactGridProps } from '../StatisticsView.types'

/**
 * Сведения раздела сеткой: подпись тише сверху, число ярче под ней. Колонок - сколько
 * влезает: у широкой середины в ряд, у узкой - по две.
 */
export const FactGrid = ({ facts }: FactGridProps) => (
  <dl className={styles.facts}>
    {facts.map((fact) => (
      <div key={fact.key} className={styles.fact}>
        <dt className={styles.factLabel}>{fact.label}</dt>
        <dd className={styles.factValue}>{fact.value}</dd>
      </div>
    ))}
  </dl>
)
