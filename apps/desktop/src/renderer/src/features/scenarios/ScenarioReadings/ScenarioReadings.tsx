import styles from './ScenarioReadings.module.scss'
import type { ScenarioReadingsProps } from './ScenarioReadings.types'

/**
 * Показания прогона строкой - сколько работал, токены, деньги, когда начат: подпись тихо,
 * значение консольным шрифтом и ровными цифрами. Одна на карточку очереди и окно прогона, чтобы
 * одни и те же цифры не выглядели в двух местах по-разному.
 */
export const ScenarioReadings = ({ readings }: ScenarioReadingsProps) => (
  <div className={styles.scenarioReadings}>
    {readings.map((reading) => (
      <span key={reading.key} className={styles.reading}>
        <span className={styles.label}>{reading.label}</span>
        <span className={styles.value}>{reading.value}</span>
      </span>
    ))}
  </div>
)
